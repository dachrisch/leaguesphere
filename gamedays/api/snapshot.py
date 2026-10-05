"""GET /api/snapshot/ — LeagueSphere's public API.

This is the only public, documented and cross-origin readable endpoint
(CORS is scoped to this path in settings). Every other /api/ path is
internal: anonymous where LeagueSphere's own pages need it, but without a
stability promise. Contract: schema_version 1 changes additively only; see
docs/topics/features/public-api/snapshot-v1.md.

Replaces the N+1 scrape pattern (1 x gameday catalog + N x per-gameday
/games/ + M x per-game HTML game-log parsing) with one configurable,
gzipped, ETag'd response. Reads stay public like the endpoints it mirrors
(GamedayViewSet.list, GameResultsListView, GameLogAPIView); the dump is
expensive by design, so it carries its own strict throttle scope — applied only
when the payload has to be rebuilt, so cache hits and 304 revalidations stay on
the general anon rate.

No Redis is operated in any environment, so the TTL payload cache is a
file-based cache (shared across gunicorn worker processes via the
container disk) with a single-flight lock against stampedes.
"""

import hashlib
import logging
import re
import time
from datetime import date

from django.core.cache import caches
from django.db.models import Count, Max, Prefetch, Q
from django.utils import timezone
from django.views.decorators.http import condition
from django.utils.decorators import method_decorator
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from gamedays.api.serializers import GamedayListSerializer, GameLogSerializer
from gamedays.models import (
    Gameday,
    GamedayDesignerState,
    Gameinfo,
    Gameresult,
    League,
    Season,
    Team,
    TeamLog,
)
from gamedays.serializers.game_results import GameInfoSerializer
from gamedays.service.model_helper import TeamLogHelper
from league_table.api.etag import standing_state_parts
from league_table.api.standings import build_standings
from league_table.models import LeagueSeasonConfig
from liveticker.service.liveticker_service import LivetickerService

logger = logging.getLogger(__name__)

SNAPSHOT_TTL_SECONDS = 300
SNAPSHOT_CACHE_ALIAS = "snapshot"
SNAPSHOT_THROTTLE_SCOPE = "snapshot"
SCHEMA_VERSION = 1
# A scope rebuilt less than this many seconds ago is served from its last
# build instead of rebuilding again: during a live gameday every score write
# changes the ETag, so without this bound each poll would be a rebuild.
SNAPSHOT_MIN_REBUILD_SECONDS = 30
# Scopes above this size (or without any filter) are "dumps" (a club's
# all-seasons widget scope stays well below it): only those are
# charged against the strict per-IP snapshot rate.
SNAPSHOT_LARGE_SCOPE_GAMEDAYS = 100
INCLUDE_GAMES = "games"
INCLUDE_LOGS = "logs"
INCLUDE_TEAMS = "teams"
INCLUDE_STANDINGS = "standings"
INCLUDE_LIVE = "live"
VALID_INCLUDES = frozenset(
    {INCLUDE_GAMES, INCLUDE_LOGS, INCLUDE_TEAMS, INCLUDE_STANDINGS, INCLUDE_LIVE}
)
LIVE_FIELDS = ("status", "time", "home", "away", "ticks")
YEAR_PATTERN = re.compile(r"^\d{4}$")


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


def _parse_years(raw_values):
    """Resolve ?year=YYYY to the seasons whose name starts with it.

    "2026" matches "2026" and "2026/2027". A well-formed year without a
    season is a filter that matches nothing (not an error): a club can embed
    next season's year before the season exists.
    """
    years = [raw.strip() for raw in raw_values]
    invalid = [year for year in years if not YEAR_PATTERN.match(year)]
    if invalid:
        raise ValidationError({"year": f"must be YYYY, got {invalid}"})
    if not years:
        return []
    year_filter = Q()
    for year in years:
        year_filter |= Q(name__startswith=year)
    return list(Season.objects.filter(year_filter).order_by("pk"))


def parse_snapshot_params(query_params):
    """Validate snapshot query params. Returns (filters, include) or raises 400."""
    leagues = _parse_int_list(query_params.getlist("league"), "league", League)
    seasons = _parse_int_list(query_params.getlist("season"), "season", Season)
    known_season_ids = {season.pk for season in seasons}
    for season in _parse_years(query_params.getlist("year")):
        if season.pk not in known_season_ids:
            seasons.append(season)
            known_season_ids.add(season.pk)
    # An empty season list means "unfiltered", so a year that matched no
    # season must empty the scope explicitly.
    matches_nothing = bool(query_params.getlist("year")) and not seasons
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
    if INCLUDE_LIVE in include:
        # The live block sits on game entries, so it needs them.
        include.add(INCLUDE_GAMES)

    return (
        {
            "leagues": leagues,
            "seasons": seasons,
            "teams": teams,
            "date_from": date_from,
            "date_to": date_to,
            "statuses": statuses,
            "matches_nothing": matches_nothing,
        },
        include,
    )


def snapshot_gameday_queryset(filters):
    """Gamedays in scope, ordered deterministically. Drafts excluded by default."""
    if filters.get("matches_nothing"):
        return Gameday.objects.none()
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
    """Freshness signals for the scope: four cheap aggregate queries.

    RULE (enforced by tests + code comments at the write paths): every
    production write to Gameinfo/Gameresult/TeamLog bumps updated_at --
    auto_now via save() (incl. partial saves through BumpUpdatedAtOnSaveMixin)
    or explicit updated_at=timezone.now() in queryset .update() calls, which
    bypass save() entirely (score entry, log deletion, canvas progression).
    A pk-max alone cannot see UPDATEs (edited rows keep their pk), and
    hashing full row contents costs full-scope scans per request (measured
    7.6 s on stage for the full dump) -- MAX(updated_at) sees every write
    at aggregate cost.
    """
    gamedays = snapshot_gameday_queryset(filters)
    state = gamedays.aggregate(count=Count("pk"), latest_update=Max("updated_at"))
    latest_result = Gameresult.objects.filter(gameinfo__gameday__in=gamedays).aggregate(
        latest=Max("updated_at")
    )["latest"]
    latest_log = TeamLog.objects.filter(gameinfo__gameday__in=gamedays).aggregate(
        latest=Max("updated_at")
    )["latest"]
    latest_gameinfo = Gameinfo.objects.filter(gameday__in=gamedays).aggregate(
        latest=Max("updated_at")
    )["latest"]
    return state, latest_result, latest_log, latest_gameinfo


def scope_teams(filters):
    """Teams referenced in scope: every result's team plus the team filter."""
    gamedays = snapshot_gameday_queryset(filters)
    return Team.objects.filter(
        Q(gameresult__gameinfo__gameday__in=gamedays)
        | Q(pk__in=[team.pk for team in filters["teams"]])
    )


def scope_league_season_configs(filters):
    """LeagueSeasonConfigs of the (league, season) pairs in scope.

    Leagues without a config (cups, tournaments) have no table and are left
    out, so a client never has to guess which league has standings.
    """
    pairs = set(
        snapshot_gameday_queryset(filters)
        .order_by()
        .values_list("league_id", "season_id")
        .distinct()
    )
    if not pairs:
        return []
    pair_filter = Q()
    for league_id, season_id in pairs:
        pair_filter |= Q(league_id=league_id, season_id=season_id)
    return list(
        LeagueSeasonConfig.objects.filter(pair_filter)
        .select_related("league", "season")
        .order_by("season__name", "league__name", "pk")
    )


def _extra_etag_parts(filters, include):
    """Freshness of data the opt-in includes read beyond the scope's rows.

    Only computed for the includes requested, so plain scopes keep exactly
    their previous queries and ETags.
    """
    parts = []
    if INCLUDE_TEAMS in include:
        latest_team = scope_teams(filters).aggregate(latest=Max("updated_at"))
        parts.append(f"teams={latest_team['latest']}")
    if INCLUDE_STANDINGS in include:
        # Standings cover the whole league-season, not just the scope: a
        # team-scoped snapshot must change when any team's result does.
        state = standing_state_parts(scope_league_season_configs(filters))
        parts.append(f"standings={[state[pk] for pk in sorted(state)]}")
    if INCLUDE_LIVE in include:
        # Which games count as "today" changes at midnight.
        parts.append(f"live={date.today().isoformat()}")
    return parts


def _compute_snapshot_state(query_params):
    try:
        filters, include = parse_snapshot_params(query_params)
    except ValidationError:
        # Invalid params still get a stable ETag; the view returns the 400.
        return {"etag": '"invalid"', "count": 0}
    state, latest_result, latest_log, latest_gameinfo = _scope_aggregates(filters)
    etag_data = (
        f"{query_params.urlencode() or 'all'}:"
        f"{sorted(include)}:"
        f"{state['count']}:{state['latest_update']}:"
        f"{latest_result}:{latest_log}:{latest_gameinfo}"
    )
    extra = _extra_etag_parts(filters, include)
    if extra:
        etag_data = ":".join([etag_data, *extra])
    return {
        "etag": f'"{hashlib.md5(etag_data.encode()).hexdigest()}"',
        "count": state["count"],
    }


def snapshot_state(request):
    """ETag and scope size, computed once per request.

    The `condition` decorator and the view both need them; memoized on the
    underlying Django request (DRF's Request proxies attribute reads to it).
    """
    django_request = getattr(request, "_request", request)
    state = getattr(django_request, "_snapshot_state", None)
    if state is None:
        state = _compute_snapshot_state(django_request.GET)
        django_request._snapshot_state = state
    return state


def generate_snapshot_etag(request):
    """ETag covering query params plus every row type in the response."""
    return snapshot_state(request)["etag"]


def is_large_scope(filters, gameday_count):
    """A dump: no narrowing filter at all, or many gamedays."""
    narrowed = (
        filters["teams"]
        or filters["leagues"]
        or filters["seasons"]
        or filters["date_from"] is not None
        or filters["date_to"] is not None
    )
    return not narrowed or gameday_count > SNAPSHOT_LARGE_SCOPE_GAMEDAYS


def scope_cache_key(query_params):
    """Cache key of a scope independent of its ETag (param order ignored)."""
    items = sorted(
        (key, value) for key, values in query_params.lists() for value in values
    )
    digest = hashlib.md5(repr(items).encode()).hexdigest()
    return f"snapshot:scope:v1:{digest}"


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


def build_teams_map(filters):
    """{"<team id>": {name, description, logo}} for every team in scope.

    `logo` is site-relative here so the cached payload is host-independent;
    the view makes it absolute per request.
    """
    return {
        str(team.pk): {
            "name": team.name,
            "description": team.description,
            "logo": team.logo.url if team.logo else None,
        }
        for team in scope_teams(filters).distinct().order_by("pk")
    }


def build_live_by_game(gamedays):
    """Liveticker entries (same text as /api/liveticker/) for today's games."""
    today = date.today()
    gameday_ids = [gameday.pk for gameday in gamedays if gameday.date == today]
    if not gameday_ids:
        return {}
    entries = LivetickerService([], [], gameday_ids).get_liveticker_as_json()
    return {entry["gameId"]: entry for entry in entries}


def build_snapshot_payload(filters, include):
    """Bulk-build the dump: a handful of queries regardless of scope size."""
    gamedays = list(
        snapshot_gameday_queryset(filters)
        .select_related("season", "league")
        .prefetch_related(
            "gameinfo_set__gameresult_set__team",
            "gameinfo_set__teamlog_set",
            # has_designer_state only needs existence: one query for the
            # whole scope, without loading the state_data blobs.
            Prefetch(
                "designer_state",
                queryset=GamedayDesignerState.objects.only("gameday_id"),
            ),
        )
    )
    live_by_game = build_live_by_game(gamedays) if INCLUDE_LIVE in include else {}
    entries = []
    for gameday in gamedays:
        entry = dict(GamedayListSerializer(gameday).data)
        if INCLUDE_GAMES in include or INCLUDE_LOGS in include:
            games = []
            for game in gameday.gameinfo_set.all():
                game_data = dict(GameInfoSerializer(game).data)
                if INCLUDE_LOGS in include:
                    game_data["log"] = build_game_log(game)
                live = live_by_game.get(game.pk)
                if live is not None and game.status != Gameinfo.STATUS_COMPLETED:
                    game_data["live"] = {field: live[field] for field in LIVE_FIELDS}
                games.append(game_data)
            entry["games"] = games
        entries.append(entry)
    payload = {
        "schema_version": SCHEMA_VERSION,
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
    if INCLUDE_TEAMS in include:
        payload["teams"] = build_teams_map(filters)
    if INCLUDE_STANDINGS in include:
        payload["standings"] = build_standings(scope_league_season_configs(filters))
    return payload


class SnapshotAPIView(APIView):
    """GET /api/snapshot/ — the public API: one configurable, cached dump."""

    permission_classes = [AllowAny]
    # The general anon rate guards every read; the strict snapshot rate is
    # applied explicitly only when the payload has to be rebuilt (see
    # `_enforce_snapshot_throttle`). Wiring it through throttle_classes would
    # charge cache hits and 304 revalidations too, so a single IP behind a
    # venue Wi-Fi / CGNAT could exhaust the budget with plain page views.
    throttle_classes = [AnonRateThrottle]
    throttle_scope = SNAPSHOT_THROTTLE_SCOPE

    def _enforce_snapshot_throttle(self, request):
        """Apply the strict `snapshot` rate; raise `Throttled` (429) if hit."""
        throttle = ScopedRateThrottle()
        if not throttle.allow_request(request, self):
            raise Throttled(wait=throttle.wait())

    @method_decorator(condition(etag_func=generate_snapshot_etag))
    def get(self, request, *args, **kwargs):
        try:
            filters, include = parse_snapshot_params(request.GET)
        except ValidationError as exc:
            return Response(exc.detail, status=400)

        state = snapshot_state(request)
        etag = state["etag"]
        cache = caches[SNAPSHOT_CACHE_ALIAS]
        cache_key = f"snapshot:v1:{etag}"
        payload = cache.get(cache_key)
        served_etag = etag
        if payload is None:
            scope_key = scope_cache_key(request.GET)
            recent = cache.get(scope_key)
            if (
                recent is not None
                and time.time() - recent["built_at"] < SNAPSHOT_MIN_REBUILD_SECONDS
            ):
                # Rebuilt moments ago: serve that build under its own ETag
                # instead of rebuilding on every live score write.
                payload = recent["payload"]
                served_etag = recent["etag"]
            else:
                payload = self._rebuild(request, filters, include, state, cache_key)
                try:
                    cache.set(
                        scope_key,
                        {"etag": etag, "payload": payload, "built_at": time.time()},
                        SNAPSHOT_TTL_SECONDS,
                    )
                except Exception:  # noqa: BLE001 - cache backend must never 500 reads
                    logger.exception("snapshot scope cache store failed")
        payload = dict(payload)
        payload["etag"] = served_etag.strip('"')
        if INCLUDE_TEAMS in include:
            payload["teams"] = {
                team_id: {
                    **team,
                    "logo": (
                        request.build_absolute_uri(team["logo"])
                        if team["logo"]
                        else None
                    ),
                }
                for team_id, team in payload["teams"].items()
            }
        response = Response(payload)
        # `condition` only sets ETag when absent: a served earlier build keeps
        # the ETag it was built under.
        response["ETag"] = served_etag
        return response

    def _rebuild(self, request, filters, include, state, cache_key):
        """Build and cache the payload: the expensive path."""
        if is_large_scope(filters, state["count"]):
            # The strict per-IP rate protects dumps; narrow scopes are bounded
            # per scope by SNAPSHOT_MIN_REBUILD_SECONDS instead.
            self._enforce_snapshot_throttle(request)
        cache = caches[SNAPSHOT_CACHE_ALIAS]
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
        return payload
