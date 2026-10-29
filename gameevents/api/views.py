"""The scorecard write path and the feed it feeds.

``POST /api/game/<id>/events``
    The app can move from ``POST /api/gamelog/<id>`` to this endpoint without a
    protocol change (the legacy body is accepted and translated), and a client
    that already speaks envelopes posts them directly. Either way one request
    is one submission: appended, projected into ``TeamLog`` and ``GameState``,
    and answered with the resulting state and cursor -- in one transaction.

``GET /api/game/<id>/feed?after=<seq>``
    ``{state, events, cursor}`` for a poller. ``ETag`` is the cursor for an
    event-sourced game (and a row-derived validator for a legacy one), so an
    unchanged feed round-trips to ``304``. A flagged projection answers
    ``409 {"detail", "needs_reconciliation": true}`` and never a score. The
    read contract lives in ``gameevents/service/feed.py``.

Write responses:

- ``201 {state, cursor}`` -- applied;
- ``200 {state, cursor}`` -- this ``client_id`` was already applied, nothing
  written (checked before the finished-game guard and the device lock: a
  replay must never be pinned);
- ``409 {"expected_next": N}`` -- the supplied ``seq`` values are not the
  store's next ones;
- ``409 {"detail": ...}`` -- the game is finished, or another device holds it;
- ``400`` -- invalid/unknown envelope or legacy event name, nothing stored.

Scope note: this endpoint projects into ``TeamLog``, ``GameState`` **and**
``Gameresult``. The result table is not re-derived here -- the projected rows
are inserted through ``GameService.write_projected_gamelog``, i.e. the same
half-score diff the legacy writer applies -- so a canonical submission leaves
``Gameresult`` exactly where ``POST /api/gamelog`` would, and the liveticker's
live list, the league table and the finalisation keep working.

Write guards: the two refusals of the scorecard's write surface are **the
gamelog view's, delegated, never reimplemented here** --
``_device_lock_response`` (``GameSetup.device_id`` + ``X-Scorecard-Device``)
and ``_finished_game_response`` ("beendet"). Both are called in the same order
as in ``POST /api/gamelog``: replay first, then finished, then lock. Keep them
delegated: one lock and one refusal message for both write paths, so a stale
tab is refused the same way whichever endpoint it hits.
"""

from http import HTTPStatus

from django.http import HttpResponseNotModified
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
from gameevents.service.feed import (
    ProjectionUnavailable,
    etag_matches,
    get_feed,
    state_body,
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


def finished_game_response(game):
    """The gamelog view's finished-game refusal, reused -- never a second one.

    A finished game ("beendet") is the final word on both write paths: the
    legacy view refuses the append, so the canonical endpoint must too, or the
    same client would get a 409 there and a silent extra row here. Delegated
    for the same reason as the lock: one status, one message.
    """

    from gamedays.api import game_views

    helper = getattr(game_views, "_finished_game_response", None)
    if helper is None:
        return None
    return helper(game)


def _response(state: GameStateValue, status: int) -> Response:
    return Response(
        {"state": state_body(state), "cursor": state.last_seq},
        status=status,
    )


class GameFeedAPIView(APIView):
    """``GET /api/game/<id>/feed?after=<seq>`` -- the poller's read model.

    Read-only and public like the other game read endpoints (the project's
    default ``IsAuthenticatedOrReadOnly``); writing the feed is the append
    endpoint's job.
    """

    def get(self, request, game_id):
        try:
            game = Gameinfo.objects.get(pk=game_id)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {game_id}")

        after = self._after(request)
        if after is None:
            return Response(
                {"detail": "after must be a non-negative integer"},
                status=HTTPStatus.BAD_REQUEST,
            )

        try:
            feed = get_feed(game, after)
        except ProjectionUnavailable as error:
            # A flagged projection is not a game state. Say so explicitly:
            # a consumer must not show a score it cannot trust.
            return Response(
                {
                    "detail": str(error),
                    "needs_reconciliation": True,
                },
                status=HTTPStatus.CONFLICT,
            )

        if etag_matches(request.headers.get("If-None-Match"), feed.etag):
            not_modified = HttpResponseNotModified()
            not_modified["ETag"] = feed.etag
            return not_modified

        response = Response(
            {
                "state": state_body(feed.state),
                "events": feed.events,
                "cursor": feed.cursor,
            }
        )
        response["ETag"] = feed.etag
        # The body is cheap but always conditional: a proxy may store it, it
        # must revalidate with the ETag before serving it again.
        response["Cache-Control"] = "no-cache"
        return response

    @staticmethod
    def _after(request):
        """``after`` as a non-negative int, or ``None`` for a 400."""

        raw = request.query_params.get("after")
        if raw in (None, ""):
            return 0
        try:
            after = int(raw)
        except (TypeError, ValueError):
            return None
        return after if after >= 0 else None


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

        # The same two refusals as ``POST /api/gamelog/``, in the same order:
        # a finished game is the final word (replays are answered above), and
        # a device that does not hold the game may not write to it.
        finished = finished_game_response(game)
        if finished is not None:
            return finished

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
