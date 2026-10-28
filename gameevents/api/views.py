"""The canonical scorecard write path: ``POST /api/game/<id>/events``.

The app can move from ``POST /api/gamelog/<id>`` to this endpoint without a
protocol change (the legacy body is accepted and translated), and a client
that already speaks envelopes posts them directly. Either way one request is
one submission: appended, projected into ``TeamLog`` and ``GameState``, and
answered with the resulting state and cursor -- in one transaction.

Responses:

- ``201 {state, cursor}`` -- applied;
- ``200 {state, cursor}`` -- this ``client_id`` was already applied, nothing
  written (checked before the device lock: a replay must never be pinned);
- ``409 {"expected_next": N}`` -- the supplied ``seq`` values are not the
  store's next ones;
- ``400`` -- invalid/unknown envelope or legacy event name, nothing stored.

Scope note: this endpoint projects into ``TeamLog`` and ``GameState`` only. It
does not touch ``Gameresult`` (the result table the league table reads); the
legacy writer still maintains that, and the app keeps posting to it, so the
event path is not a drop-in replacement for ``Gameresult`` in slice 1.
"""

from http import HTTPStatus

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.api.serializers import parse_event_request
from gameevents.models import GameEvent
from gameevents.service.append import (
    SequenceConflict,
    append_submission,
    project_game,
    side_for_team,
)
from gameevents.service.legacy import from_legacy_entries
from gameevents.service.projector import GameEventValue, GameStateValue, InvalidEnvelope
from gamedays.models import Gameinfo, Team
from gamedays.service.game_service import GameService


def device_lock_response(request, game_id, data=None):
    """The gamelog view's device lock, reused -- never a second lock.

    The lock (``GameSetup.device_id`` + ``X-Scorecard-Device``) belongs to the
    scorecard's write surface; this endpoint is its second caller. On a
    baseline that does not carry the lock yet no helper exists and every
    device may write, exactly as ``POST /api/gamelog`` behaves there.
    """

    from gamedays.api import game_views

    helper = getattr(game_views, "_device_lock_response", None)
    if helper is None:
        return None
    return helper(request, game_id, data)


def _state_body(state: GameStateValue) -> dict:
    return {
        "score_home": state.score_home,
        "score_away": state.score_away,
        "period": state.period,
        "in_possession": state.in_possession or None,
        "last_seq": state.last_seq,
    }


def _response(state: GameStateValue, status: int) -> Response:
    return Response(
        {"state": _state_body(state), "cursor": state.last_seq},
        status=status,
    )


class GameEventsAPIView(APIView):
    def post(self, request, game_id):
        try:
            game = Gameinfo.objects.get(pk=game_id)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {game_id}")

        try:
            parsed = parse_event_request(request.data)
        except InvalidEnvelope as error:
            return Response({"detail": str(error)}, status=HTTPStatus.BAD_REQUEST)
        if parsed.game_id is not None and parsed.game_id != game.pk:
            return Response(
                {"detail": "gameId does not match the game in the URL"},
                status=HTTPStatus.BAD_REQUEST,
            )

        if GameEvent.objects.filter(game=game, client_id=parsed.client_id).exists():
            return _response(project_game(game).state, HTTPStatus.OK)

        conflict = device_lock_response(request, game.pk, request.data)
        if conflict is not None:
            return conflict

        try:
            values = self._values(game, parsed)
            outcome = append_submission(
                game,
                values,
                client_id=parsed.client_id,
                source=GameEvent.Source.V2,
                write_rows=True,
                author=request.user,
            )
        except SequenceConflict as error:
            return Response(
                {"expected_next": error.expected_next},
                status=HTTPStatus.CONFLICT,
            )
        except InvalidEnvelope as error:
            return Response({"detail": str(error)}, status=HTTPStatus.BAD_REQUEST)
        except Team.DoesNotExist as error:
            raise NotFound(detail=str(error))

        return _response(
            outcome.state,
            HTTPStatus.CREATED if outcome.applied else HTTPStatus.OK,
        )

    @staticmethod
    def _values(game, parsed) -> list[GameEventValue]:
        if parsed.mode == "envelope":
            return [
                GameEventValue(
                    type=event["type"],
                    code=event.get("code") or "",
                    side=event.get("side") or None,
                    player=event.get("player"),
                    period=event.get("period", 1),
                    payload=event.get("payload") or {},
                    seq=event.get("seq"),
                    client_id=parsed.client_id,
                )
                for event in parsed.events
            ]

        team = GameService._resolve_team(parsed.team)
        return from_legacy_entries(
            parsed.entries,
            side=side_for_team(game, team),
            half=parsed.half,
            client_id=parsed.client_id,
        )
