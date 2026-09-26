"""GET /api/snapshot/ — mass endpoint for API consumers.

Replaces the N+1 scrape pattern (1 x gameday catalog + N x per-gameday
/games/ + M x per-game HTML game-log parsing) with one configurable,
gzipped, ETag'd response. Reads stay public like the endpoints it mirrors
(GamedayViewSet.list, GameResultsListView, GameLogAPIView); the dump is
expensive by design, so it carries its own strict throttle scope.

No Redis is operated in any environment, so the TTL payload cache is a
file-based cache (shared across gunicorn worker processes via the
container disk) with a single-flight lock against stampedes.
"""

import hashlib
import logging
from datetime import date

from django.core.cache import caches
from django.db.models import Count, Max
from django.utils import timezone
from django.views.decorators.http import condition
from django.utils.decorators import method_decorator
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from gamedays.api.serializers import GamedayListSerializer, GameLogSerializer
from gamedays.models import Gameday, Gameinfo, Gameresult, League, Season, Team, TeamLog
from gamedays.serializers.game_results import GameInfoSerializer
from gamedays.service.model_helper import TeamLogHelper

logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 300
SNAPSHOT_CACHE_ALIAS = "snapshot"
SNAPSHOT_THROTTLE_SCOPE = "snapshot"
INCLUDE_GAMES = "games"
INCLUDE_LOGS = "logs"
VALID_INCLUDES = frozenset({INCLUDE_GAMES, INCLUDE_LOGS})


def _parse_int_list(raw_values, param_name, model):
    """Parse repeated ?param=<id> values into model instances (400 on error)."""
    ids = []
    for raw in raw_values:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            raise ValidationError({param_name: f"must be integer ids, got {raw!r}"})
    if not ids:
        return []
    instances = list(model.objects.filter(pk__in=ids))
    if len(instances) != len(set(ids)):
        found = {obj.pk for obj in instances}
        missing = sorted(set(ids) - found)
        raise ValidationError({param_name: f"unknown {model.__name__} ids: {missing}"})
    return instances


def _parse_date(raw, param_name):
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError):
        raise ValidationError({param_name: f"must be YYYY-MM-DD, got {raw!r}"})


def parse_snapshot_params(query_params):
    """Validate snapshot query params. Returns (filters, include) or raises 400."""
    leagues = _parse_int_list(query_params.getlist("league"), "league", League)
    seasons = _parse_int_list(query_params.getlist("season"), "season", Season)
    teams = _parse_int_list(query_params.getlist("team"), "team", Team)

    date_from = (
        _parse_date(query_params["date_from"], "date_from")
        if "date_from" in query_params
        else None
    )
    date_to = (
        _parse_date(query_params["date_to"], "date_to")
        if "date_to" in query_params
        else None
    )

    statuses = query_params.getlist("status")
    valid_statuses = {choice[0] for choice in Gameday.STATUS_CHOICES}
    unknown_statuses = [s for s in statuses if s not in valid_statuses]
    if unknown_statuses:
        raise ValidationError({"status": f"unknown statuses: {unknown_statuses}"})

    include = set()
    if "include" in query_params:
        for token in query_params["include"].split(","):
            token = token.strip()
            if token not in VALID_INCLUDES:
                raise ValidationError(
                    {"include": f"must be a combination of {sorted(VALID_INCLUDES)}"}
                )
            include.add(token)

    return (
        {
            "leagues": leagues,
            "seasons": seasons,
            "teams": teams,
            "date_from": date_from,
            "date_to": date_to,
            "statuses": statuses,
        },
        include,
    )


def snapshot_gameday_queryset(filters):
    """Gamedays in scope, ordered deterministically. Drafts excluded by default."""
    queryset = Gameday.objects.all()
    if filters["leagues"]:
        queryset = queryset.filter(
            league__in=[league.pk for league in filters["leagues"]]
        )
    if filters["seasons"]:
        queryset = queryset.filter(
            season__in=[season.pk for season in filters["seasons"]]
        )
    if filters["teams"]:
        # Participation, not results: rows exist (teams assigned) while
        # fh/sh are still NULL, so scheduled-but-unplayed fixtures match.
        queryset = queryset.filter(
            gameinfo__gameresult__team__in=[team.pk for team in filters["teams"]]
        ).distinct()
    if filters["date_from"] is not None:
        queryset = queryset.filter(date__gte=filters["date_from"])
    if filters["date_to"] is not None:
        queryset = queryset.filter(date__lte=filters["date_to"])
    if filters["statuses"]:
        queryset = queryset.filter(status__in=filters["statuses"])
    else:
        queryset = queryset.exclude(status=Gameday.STATUS_DRAFT)
    return queryset.order_by("date", "id")


def _scope_aggregates(filters):
    """Freshness signals for the scope.

    pk-max alone cannot see UPDATEs (edited scores keep their pk), so the
    result/log/gameinfo signals are content hashes over the rows in scope.
    Costs a few indexed FK scans per request -- correctness over cleverness;
    the TTL cache means a full payload build happens at most once per TTL
    window while every request pays only these cheap fingerprint queries.
    """
    gamedays = snapshot_gameday_queryset(filters)
    state = gamedays.aggregate(count=Count("pk"), latest_update=Max("updated_at"))
    result_rows = list(
        Gameresult.objects.filter(gameinfo__gameday__in=gamedays)
        .order_by("gameinfo_id", "isHome")
        .values_list("gameinfo_id", "isHome", "team_id", "fh", "sh", "pa")
    )
    log_rows = list(
        TeamLog.objects.filter(gameinfo__gameday__in=gamedays)
        .order_by("gameinfo_id", "sequence", "pk")
        .values_list(
            "gameinfo_id",
            "team_id",
            "sequence",
            "event",
            "player",
            "value",
            "half",
            "isDeleted",
            "cop",
        )
    )
    gameinfo_rows = list(
        Gameinfo.objects.filter(gameday__in=gamedays)
        .order_by("pk")
        .values_list(
            "pk",
            "status",
            "gameStarted",
            "gameHalftime",
            "gameFinished",
            "stage",
            "standing",
            "officials_id",
        )
    )

    def content_hash(rows):
        return hashlib.md5(repr(rows).encode()).hexdigest()

    return (
        state,
        content_hash(result_rows),
        content_hash(log_rows),
        content_hash(gameinfo_rows),
    )


def generate_snapshot_etag(request):
    """ETag covering query params plus every row type in the response."""
    try:
        filters, include = parse_snapshot_params(request.GET)
    except ValidationError:
        # Invalid params still get a stable ETag; the view returns the 400.
        return '"invalid"'
    state, results_hash, logs_hash, gameinfo_hash = _scope_aggregates(filters)
    etag_data = (
        f"{request.GET.urlencode() or 'all'}:"
        f"{sorted(include)}:"
        f"{state['count']}:{state['latest_update']}:"
        f"{results_hash}:{logs_hash}:{gameinfo_hash}"
    )
    return f'"{hashlib.md5(etag_data.encode()).hexdigest()}"'


def build_game_log(game):
    """Same payload shape as GET /api/gamelog/<id>, built from prefetched
    relations instead of fresh queries. Mirrors GameLogAPIView.get."""
    results = list(game.gameresult_set.all())
    home_result = next((r for r in results if r.isHome), None)
    away_result = next((r for r in results if not r.isHome), None)

    def team_name(result):
        if result is None or result.team is None:
            return None
        return result.team.name

    def team_id(result):
        return result.team_id if result is not None else None

    def overall(result):
        if result is None:
            return 0
        return (result.fh or 0) + (result.sh or 0)

    def half_score(result, half):
        if result is None:
            return 0
        return (result.fh if half == 1 else result.sh) or 0

    teamlogs = {"home": [], "away": []}
    side_team_ids = {
        "home": home_result.team_id if home_result is not None else None,
        "away": away_result.team_id if away_result is not None else None,
    }
    # Mirror GameLogAPIView.get: each side selects by filter(team=<side id>),
    # so a team on both sides (e.g. placeholder double-assignment) appears
    # in both buckets.
    for bucket, side_team_id in side_team_ids.items():
        if side_team_id is None:
            continue
        for teamlog in game.teamlog_set.all():
            if teamlog.team_id != side_team_id:
                continue
            if teamlog.event in TeamLogHelper.EXCLUDED_EVENTS:
                continue
            teamlogs[bucket].append(
                {
                    "sequence": teamlog.sequence,
                    "cop": teamlog.cop,
                    "event": teamlog.event,
                    "player": teamlog.player,
                    "isDeleted": teamlog.isDeleted,
                    "half": teamlog.half,
                }
            )
    for entries in teamlogs.values():
        entries.sort(key=lambda entry: entry["sequence"], reverse=True)

    gamelog = {
        GameLogSerializer.ID: game.pk,
        GameLogSerializer.GAME_HALFTIME: game.gameHalftime,
        GameLogSerializer.HOME_TEAM: team_name(home_result),
        GameLogSerializer.AWAY_TEAM: team_name(away_result),
        "home_id": team_id(home_result),
        "away_id": team_id(away_result),
        GameLogSerializer.SCORE_HOME_OVERALL: overall(home_result),
        GameLogSerializer.SCORE_HOME_FH: half_score(home_result, 1),
        GameLogSerializer.SCORE_HOME_SH: half_score(home_result, 2),
        GameLogSerializer.SCORE_AWAY_OVERALL: overall(away_result),
        GameLogSerializer.SCORE_AWAY_FH: half_score(away_result, 1),
        GameLogSerializer.SCORE_AWAY_SH: half_score(away_result, 2),
        GameLogSerializer.TEAMLOG_HOME: teamlogs["home"],
        GameLogSerializer.TEAMLOG_AWAY: teamlogs["away"],
    }
    return GameLogSerializer(instance=gamelog).data


def build_snapshot_payload(filters, include):
    """Bulk-build the dump: a handful of queries regardless of scope size."""
    gamedays = list(
        snapshot_gameday_queryset(filters)
        .select_related("season", "league")
        .prefetch_related(
            "gameinfo_set__gameresult_set__team",
            "gameinfo_set__teamlog_set",
        )
    )
    entries = []
    for gameday in gamedays:
        entry = dict(GamedayListSerializer(gameday).data)
        if INCLUDE_GAMES in include or INCLUDE_LOGS in include:
            games = []
            for game in gameday.gameinfo_set.all():
                game_data = dict(GameInfoSerializer(game).data)
                if INCLUDE_LOGS in include:
                    game_data["log"] = build_game_log(game)
                games.append(game_data)
            entry["games"] = games
        entries.append(entry)
    return {
        "generated_at": timezone.now().isoformat(),
        "scope": {
            "league": sorted({league.pk for league in filters["leagues"]}) or None,
            "season": sorted({season.pk for season in filters["seasons"]}) or None,
            "team": sorted({team.pk for team in filters["teams"]}) or None,
            "date_from": (
                filters["date_from"].isoformat()
                if filters["date_from"] is not None
                else None
            ),
            "date_to": (
                filters["date_to"].isoformat()
                if filters["date_to"] is not None
                else None
            ),
            "status": filters["statuses"] or None,
            "include": sorted(include),
            "count": len(entries),
        },
        "gamedays": entries,
    }


class SnapshotAPIView(APIView):
    """GET /api/snapshot/ — one configurable dump for API consumers."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = SNAPSHOT_THROTTLE_SCOPE

    @method_decorator(condition(etag_func=generate_snapshot_etag))
    def get(self, request, *args, **kwargs):
        try:
            filters, include = parse_snapshot_params(request.GET)
        except ValidationError as exc:
            return Response(exc.detail, status=400)

        etag = generate_snapshot_etag(request)
        cache = caches[SNAPSHOT_CACHE_ALIAS]
        cache_key = f"snapshot:v1:{etag}"
        payload = cache.get(cache_key)
        if payload is None:
            # Single-flight: only one worker builds a cold scope; the rest
            # fall through and build anyway rather than block.
            lock_key = f"{cache_key}:lock"
            try:
                have_lock = cache.add(lock_key, True, timeout=60)
            except Exception:  # noqa: BLE001 - cache backend must never 500 reads
                logger.exception("snapshot cache lock failed")
                have_lock = True
            payload = build_snapshot_payload(filters, include)
            try:
                cache.set(cache_key, payload, SNAPSHOT_TTL_SECONDS)
                if have_lock:
                    cache.delete(lock_key)
            except Exception:  # noqa: BLE001 - cache backend must never 500 reads
                logger.exception("snapshot cache store failed")
        payload = dict(payload)
        payload["etag"] = etag.strip('"')
        return Response(payload)
