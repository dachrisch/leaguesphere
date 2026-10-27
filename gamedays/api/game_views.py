import json
import logging
import uuid
from collections import OrderedDict
from http import HTTPStatus

from django.db import transaction
from django.db.models import F, Q
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import UpdateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from gamedays.api.serializers import (
    GameFinalizer,
    GameSetupSerializer,
    GameLogSerializer,
)
from gamedays.models import Team, Gameinfo, GameSetup, Gameresult, TeamLog
from gamedays.service.game_service import GameService
from gamedays.service.gamelog import gameday_ref_now, serialize_events
from gamedays.service.wrapper.gameinfo_wrapper import IllegalGameTransition
from gamedays.service.gameday_service import GamedayService
from gamedays.service.model_helper import GameresultHelper, TeamLogHelper
from passcheck.models import PasscheckVerification, PlayerlistGameday

logger = logging.getLogger(__name__)

def _client_id(raw):
    """``None`` when no id was sent (old app), a UUID, or a 400."""
    if raw in (None, ""):
        return None
    try:
        return uuid.UUID(str(raw))
    except (AttributeError, TypeError, ValueError):
        raise ValidationError({"client_id": "must be a UUID"})


def _validate_gamelog_payload(data):
    """Reject malformed gamelog write payloads with a 400 instead of a 500.

    The scorecard posts ``event`` as a list of ``{name, player?, input?}``
    objects and ``half`` as ``1``/``2``. Anything else (e.g. a bare-string
    event that ``GameLogCreator`` would iterate char-by-char, or a half that
    cannot be stored) is client error, not server failure (#1980 F1).
    """
    event = data.get("event")
    half = data.get("half")
    if not isinstance(event, list) or not event:
        raise ValidationError({"event": "must be a non-empty list of event objects"})
    for entry in event:
        if not isinstance(entry, dict):
            raise ValidationError({"event": "each entry must be an object"})
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise ValidationError({"event": "each entry must have a non-empty 'name'"})
    if half not in (1, 2):
        raise ValidationError({"half": "must be 1 or 2"})


class GameLogAPIView(APIView):

    def get(self, request: Request, *args, **kwargs):
        game_id = kwargs.get("id")
        if request.query_params.get("other") is not None:
            try:
                gamelog = GameService(game_id).get_gamelog()
                return Response(
                    json.loads(gamelog.as_json(), object_pairs_hook=OrderedDict)
                )
            except Gameinfo.DoesNotExist:
                raise NotFound(detail=f"No game found for gameId {game_id}")
        gamelog = (
            Gameinfo.objects.filter(id=game_id)
            .annotate(
                home_id=GameresultHelper.get_gameresult_team_subquery(
                    is_home=True, team_column="id"
                ),
                home=GameresultHelper.get_gameresult_team_subquery(
                    is_home=True, team_column="name"
                ),
                away_id=GameresultHelper.get_gameresult_team_subquery(
                    is_home=False, team_column="id"
                ),
                away=GameresultHelper.get_gameresult_team_subquery(
                    is_home=False, team_column="name"
                ),
                score_home_overall=GameresultHelper.get_gameresult_score(
                    True, True, True
                ),
                score_home_fh=GameresultHelper.get_gameresult_score(True, is_fh=True),
                score_home_sh=GameresultHelper.get_gameresult_score(True, is_sh=True),
                score_away_overall=GameresultHelper.get_gameresult_score(
                    False, True, True
                ),
                score_away_fh=GameresultHelper.get_gameresult_score(False, is_fh=True),
                score_away_sh=GameresultHelper.get_gameresult_score(False, is_sh=True),
                gameday_date=F("gameday__date"),
                inPossession=F("in_possession"),
            )
            .values(
                *GameLogSerializer.ALL_FIELD_VALUES,
                "home_id",
                "away_id",
                GameLogSerializer.GAMEDAY_DATE,
            )
        )
        if not gamelog.exists():
            raise NotFound(detail=f"No game found for gameId {game_id}")
        gamelog = list(gamelog)[0]
        if not gamelog.get(GameLogSerializer.IN_POSSESSION):
            # A blank stored value means "no possession", not "the empty team".
            gamelog[GameLogSerializer.IN_POSSESSION] = None
        gamelog.update(
            {
                GameLogSerializer.EVENTS: serialize_events(
                    TeamLog.objects.filter(gameinfo_id=game_id),
                    {
                        gamelog.get("home_id"): gamelog.get(
                            GameLogSerializer.HOME_TEAM
                        ),
                        gamelog.get("away_id"): gamelog.get(
                            GameLogSerializer.AWAY_TEAM
                        ),
                    },
                    gameday_ref_now(gamelog.get(GameLogSerializer.GAMEDAY_DATE)),
                )
            }
        )
        gamelog.update(
            {
                GameLogSerializer.TEAMLOG_HOME: list(
                    TeamLog.objects.filter(gameinfo=game_id, team=gamelog["home_id"])
                    .exclude(event__in=TeamLogHelper.EXCLUDED_EVENTS)
                    .order_by("-sequence")
                    .values()
                )
            }
        )
        gamelog.update(
            {
                GameLogSerializer.TEAMLOG_AWAY: list(
                    TeamLog.objects.filter(gameinfo=game_id, team=gamelog["away_id"])
                    .exclude(event__in=TeamLogHelper.EXCLUDED_EVENTS)
                    .order_by("-sequence")
                    .values()
                )
            }
        )
        return Response(GameLogSerializer(instance=gamelog).data)

    def post(self, request, *args, **kwargs):
        try:
            data = request.data
            _validate_gamelog_payload(data)
            client_id = _client_id(data.get("client_id"))
            game_service = GameService(data.get("gameId"))
            gamelog, applied = game_service.create_gamelog_once(
                data.get("team"),
                data.get("event"),
                request.user,
                data.get("half"),
                client_id=client_id,
            )
            return Response(
                json.loads(gamelog.as_json(), object_pairs_hook=OrderedDict),
                # A repeated submission wrote nothing, so it is a 200.
                status=HTTPStatus.CREATED if applied else HTTPStatus.OK,
            )
        except Gameinfo.DoesNotExist:
            raise NotFound(
                detail=f'Could not create team logs ... gameId {request.data.get("gameId")} not found'
            )
        except Team.DoesNotExist:
            raise NotFound(
                detail=f'Could not create team logs ... team {request.data.get("team")} not found'
            )

    def delete(self, request: Request, *args, **kwargs):
        game_id = kwargs.get("id")
        sequence = request.data.get("sequence")
        team_log_id = request.data.get("team_log_id")
        has_sequence = sequence is not None
        has_team_log_id = team_log_id is not None
        if has_sequence == has_team_log_id:
            raise ValidationError(
                {
                    "detail": "Send exactly one of 'sequence' (whole play) or "
                    "'team_log_id' (one row)."
                }
            )
        try:
            game = Gameinfo.objects.get(pk=game_id)
        except Gameinfo.DoesNotExist:
            raise NotFound(
                detail=f"Could not delete team logs ... gameId {game_id} not found"
            )
        game_service = GameService(game_id)
        if has_team_log_id:
            # The v2 log undoes one row at a time: a penalty (sequence 0) must
            # not take every timeout of the game with it.
            try:
                team_log_id = int(team_log_id)
            except (TypeError, ValueError):
                raise ValidationError({"team_log_id": "must be an integer"})
            row = TeamLog.objects.filter(gameinfo=game, pk=team_log_id).first()
            if row is None:
                raise NotFound(
                    detail=f"Could not delete team log {team_log_id} of game {game_id}"
                )
            if not self._can_delete_team_log(request.user, game, row):
                raise PermissionDenied(
                    detail="You do not have permission to delete this game log entry."
                )
            gamelog = game_service.delete_gamelog_entry(row.pk)
        else:
            if not self._can_delete_log_entry(request.user, game, sequence):
                raise PermissionDenied(
                    detail="You do not have permission to delete this game log entry."
                )
            gamelog = game_service.delete_gamelog(sequence)
        return Response(
            json.loads(gamelog.as_json(), object_pairs_hook=OrderedDict),
            status=HTTPStatus.OK,
        )

    @staticmethod
    def _can_delete_log_entry(user, game: Gameinfo, sequence) -> bool:
        """Whether the user may delete a log entry.

        Allowed for staff, the gameday author, or the user who recorded the
        entry (so on-site scorecard officials can still undo their own
        mistakes while unrelated authenticated users cannot tamper with the
        log).
        """
        if not user.is_authenticated:
            return False
        if user.is_staff:
            return True
        if game.gameday.author_id == user.pk:
            return True
        return TeamLog.objects.filter(
            gameinfo=game, sequence=sequence, isDeleted=False, author=user
        ).exists()

    @staticmethod
    def _can_delete_team_log(user, game: Gameinfo, row: TeamLog) -> bool:
        """The same permission rule as {@link _can_delete_log_entry}, per row."""
        if not user.is_authenticated:
            return False
        if user.is_staff:
            return True
        if game.gameday.author_id == user.pk:
            return True
        return not row.isDeleted and row.author_id == user.pk


class GameHalftimeAPIView(APIView):
    def put(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        try:
            game_service = GameService(pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        try:
            game_service.update_halftime(request.user)
        except IllegalGameTransition as e:
            logger.warning(
                "Rejected halftime transition for game %s: %s", kwargs.get("pk"), e
            )
            return Response(
                {"detail": "Dieser Spielstatus erlaubt keine Halbzeit."},
                status=HTTPStatus.CONFLICT,
            )
        return Response()


class GameFinalizeUpdateView(UpdateAPIView):
    serializer_class = GameFinalizer
    queryset = GameSetup.objects.all()

    def update(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        try:
            game_service = GameService(pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        try:
            game_service.update_game_finished(request.user)
        except IllegalGameTransition as e:
            logger.warning("Rejected finalize for game %s: %s", pk, e)
            return Response(
                {"detail": "Dieser Spielstatus erlaubt kein Spielende."},
                status=HTTPStatus.CONFLICT,
            )
        game_setup, _ = GameSetup.objects.get_or_create(gameinfo_id=pk)
        serializer = GameFinalizer(instance=game_setup, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=HTTPStatus.OK)
        else:
            return Response(serializer.errors, status=HTTPStatus.BAD_REQUEST)


class GameSetupCreateOrUpdateView(RetrieveUpdateAPIView):
    serializer_class = GameSetupSerializer
    queryset = GameSetup.objects.all()

    def get(self, request, *args, **kwargs):
        game_id = kwargs.get("pk")
        try:
            game_setup = GameSetup.objects.get(gameinfo_id=game_id)
            serializer = GameSetupSerializer(game_setup)
            return Response(serializer.data, status=HTTPStatus.OK)
        except GameSetup.DoesNotExist:
            return Response(data={}, status=HTTPStatus.OK)

    def update(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        game_setup = GameSetup.objects.filter(gameinfo_id=pk).first()
        serializer = GameSetupSerializer(instance=game_setup, data=request.data)
        # Validate before touching anything: a malformed payload must not leave
        # a setup row behind (it would make the game look prepared).
        if not serializer.is_valid():
            return Response(serializer.errors, status=HTTPStatus.BAD_REQUEST)

        is_game_setup_created = game_setup is None
        try:
            # Starting the game, writing its log entry and creating the setup
            # row are one unit. A rejected transition (409) must roll back to
            # the state before the request, otherwise the retry sees an
            # existing row and silently skips `update_gamestart` — returning
            # 200 for a game that never started.
            with transaction.atomic():
                if is_game_setup_created:
                    GameService(pk).update_gamestart(request.user)
                    serializer.save(gameinfo_id=pk)
                else:
                    serializer.save()
        except IllegalGameTransition as e:
            logger.warning("Rejected gamestart for game %s: %s", pk, e)
            return Response(
                {"detail": "Dieser Spielstatus erlaubt keinen Spielstart."},
                status=HTTPStatus.CONFLICT,
            )
        return Response(serializer.data, status=HTTPStatus.OK)


class GamesToWhistleAPIView(APIView):
    def get(self, request, *args, **kwargs):
        gs = GamedayService.create(kwargs["pk"])
        games_to_whistle = gs.get_games_to_whistle(kwargs.get("team"))
        games_to_whistle = games_to_whistle.to_json(orient="records")
        games_to_whistle = json.loads(
            games_to_whistle, object_pairs_hook=OrderedDict
        )
        self._annotate_passcheck(games_to_whistle, kwargs["pk"])
        return Response(games_to_whistle)

    @staticmethod
    def _annotate_passcheck(games_to_whistle, gameday_id):
        """Add the passcheck state the scorecard game list renders.

        ``PasscheckVerification`` holds one row per verified team per gameday;
        a game is fully checked only when both of its teams are verified.

        Caution: the pandas merge in ``GamedayModelWrapper`` keeps both ``id``
        columns, and ``id_home``/``id_away`` are the renamed ``Gameresult`` pks
        (``id_y``) — not ``Team`` pks. They arrive as strings (``""`` for an
        unresolved bracket placeholder), so the lookup keys are stringified.
        """
        game_ids = [game["id"] for game in games_to_whistle]
        team_by_result = {
            str(result_id): team_id
            for result_id, team_id in Gameresult.objects.filter(
                gameinfo_id__in=game_ids
            ).values_list("id", "team_id")
        }
        verified = set(
            PasscheckVerification.objects.filter(gameday_id=gameday_id).values_list(
                "team_id", flat=True
            )
        )
        for game in games_to_whistle:
            home = team_by_result.get(str(game.get("id_home", "")))
            away = team_by_result.get(str(game.get("id_away", "")))
            game["passcheck"] = home in verified and away in verified


class GameRosterAPIView(APIView):
    """Jersey plus surname for both teams of a game.

    The touchdown sheet picks players from this list, so it must never leak the
    pass number. ``IsAuthenticated`` is explicit: the DRF default is
    ``IsAuthenticatedOrReadOnly``, which would expose surnames and jerseys to
    anonymous visitors.

    Eligibility mirrors the passcheck (``get_roster_with_validation``): a
    player is active on the gameday date, not merely "currently on the team".
    The ``PlayerlistGameday`` snapshot pins the roster to this day. Duplicate
    jersey numbers are returned as they are — the passcheck validation flags
    that data problem, and hiding a duplicate here would mask it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            game = Gameinfo.objects.select_related("gameday").get(pk=pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")

        sides = {
            row["team_id"]: "home" if row["isHome"] else "away"
            for row in Gameresult.objects.filter(
                gameinfo=game, team__isnull=False
            ).values("team_id", "isHome")
        }
        if not sides:  # bracket placeholder: both teams are still unknown
            return Response([])

        rows = (
            PlayerlistGameday.objects.filter(
                gameday_id=game.gameday_id,
                playerlist__team_id__in=sides,
            )
            .filter(playerlist__joined_on__lte=game.gameday.date)
            .filter(
                Q(playerlist__left_on__isnull=True)
                | Q(playerlist__left_on__gt=game.gameday.date)
            )
            .select_related("playerlist__player__person")
        )
        return Response(
            [
                {
                    "side": sides[row.playerlist.team_id],
                    "jersey": row.gameday_jersey,
                    "name": self._display_name(row.playerlist.player.person),
                }
                for row in sorted(
                    rows,
                    key=lambda row: (
                        sides[row.playerlist.team_id] != "home",
                        row.gameday_jersey,
                        row.playerlist_id,
                    ),
                )
            ]
        )

    @staticmethod
    def _display_name(person):
        return person.last_name or person.first_name or None


class GamePossessionAPIView(APIView):
    def put(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        try:
            game_service = GameService(pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        team = request.data.get("team")
        home = Gameresult.objects.get(
            gameinfo=game_service.gameinfo.gameinfo, isHome=True
        ).team
        away = Gameresult.objects.get(
            gameinfo=game_service.gameinfo.gameinfo, isHome=False
        ).team
        valid_teams = {str(home.pk), home.name, str(away.pk), away.name}
        if team not in valid_teams:
            raise ValidationError(
                {"team": f"must be one of the game's teams ({home.name}, {away.name})"}
            )
        game_service.update_team_in_possesion(team)
        return Response()


class ConfigPenalties(APIView):
    def get(self, request, *args, **kwargs):
        penalty_list = [
            {
                "name": "illegaler Kontakt Defense",
                "subtext": "BS/1st 10",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Flag Guarding",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {"name": "Fehlstart", "subtext": "DB/5", "isPenaltyAgainstOpponent": False},
            {
                "name": "Abschirmen (Blocken) Offense",
                "subtext": "BS/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Kontakt Offense",
                "subtext": "BS/LoD 10",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Abschirmen (Blocken) Defense",
                "subtext": "BS/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Defense Passbehinderung",
                "subtext": "BS/1st 10",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Behinderung Spieldurchführung Defense",
                "subtext": "BS/1st 10",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Passverzögerung",
                "subtext": "SL/LoD",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegale Ballübergabe",
                "subtext": "SF/LoD",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Rückwärtspass",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegales Touching/Ballberührung",
                "subtext": "SL/LoD",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Vorwärtsschlagen eines Rückwärtspasses durch das passende Team",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Vorwärtspass",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Offense Passbehinderung",
                "subtext": "BS/LoD 10",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Behinderung Spieldurchführung Offense",
                "subtext": "BS/LoD 10",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Springen",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Hechten",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Kick durch Runner",
                "subtext": "SF/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Snap",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Spielverzögerung Offense",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Spielverzögerung Defense",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Encroachment",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Shift",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegale Motion",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Lauf",
                "subtext": "SL/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegaler Laufspielzug",
                "subtext": "SL/LoD 5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Defense Offside",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Störende Signale",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegales Blitzersignal",
                "subtext": "DB/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegaler Blitz",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegales Flaggenziehen",
                "subtext": "BS/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegales Treten eines Pass Defense",
                "subtext": "BS/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegales Treten eines Pass Offense",
                "subtext": "BS/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Behinderung an der Seitenlinie Offense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Behinderung an der Seitenlinie Defense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegale Spielteilnahme Offense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegale Spielteilnahme Defense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "illegale Auswechslung Offense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "illegale Auswechslung Defense",
                "subtext": "SL/5",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Unsportliches Verhalten Offense",
                "subtext": "DB/10 Notiz",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Unsportliches Verhalten Defense",
                "subtext": "DB/10 Notiz",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Grob unsportliches Verhalten Offense",
                "subtext": "Disqualifkation",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Grob unsportliches Verhalten Defense",
                "subtext": "Disqualifkation",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Person mit illegaler Ausrüstung verlässt nicht das Feld Offense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Person mit illegaler Ausrüstung verlässt nicht das Feld Defense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Person mit fehlender vorgeschriebener Ausrüstung verlässt nicht das Feld Offense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Person mit fehlender vorgeschriebener Ausrüstung verlässt nicht das Feld Defense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": True,
            },
            {
                "name": "Person mit blutender Wunde verlässt nicht das Feld Offense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": False,
            },
            {
                "name": "Person mit blutender Wunde verlässt nicht das Feld Defense",
                "subtext": "DB/TO",
                "isPenaltyAgainstOpponent": True,
            },
        ]
        return Response(penalty_list)
