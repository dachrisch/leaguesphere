import json
import logging
import uuid
from collections import OrderedDict
from http import HTTPStatus

from django.db import transaction
from django.db.models import F, Max, Q
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import UpdateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.models import GameEvent
from gameevents.service.log_payload import (
    event_payloads_for_rows,
    event_seqs_for_rows,
)
from gameevents.service.projector import InvalidEnvelope
from gameevents.service.rules import load_rules, penalty_catalogue
from gameevents.service.undo import record_legacy_undo
from gamedays.api.serializers import (
    GamedaySerializer,
    GameFinalizer,
    GameSetupSerializer,
    GameLogSerializer,
)
from gamedays.models import (
    Team,
    Gameinfo,
    GameSetup,
    GameLogSubmission,
    Gameresult,
    TeamLog,
)
from gamedays.service.device_lock import release_device_lock, stored_device
from gamedays.service.game_service import GameService
from gamedays.service.gamelog import gameday_ref_now, serialize_events
from gamedays.service.wrapper.gameinfo_wrapper import IllegalGameTransition
from gamedays.service.gameday_service import GamedayService
from gamedays.service.model_helper import GameresultHelper, TeamLogHelper
from gamedays.service import passcheck_hooks

# Keep the historical logger name: L3 preserved `officials.views` for the
# same kind of move, and log queries must keep matching the old emitter.
logger = logging.getLogger("gamedays.api.game_views")

DEVICE_LOCK_DETAIL = "Dieses Spiel läuft auf einem anderen Gerät."
GAME_FINISHED_DETAIL = "Dieses Spiel ist beendet."


def _finished_game_response(game) -> Response | None:
    """409 once a game is `beendet`, ``None`` while it is still open.

    A finished game is the final word: the old app navigates away from the
    scorecard after the result, and v2 must not append to (or undo) a log the
    result already covers. Clients replay their queue, so this is the guard
    that a stale tab or a late flush runs into — not a silent extra row.
    """
    if str(getattr(game, "status", "") or "").strip().lower() == "beendet":
        return Response(
            {"detail": GAME_FINISHED_DETAIL},
            status=HTTPStatus.CONFLICT,
        )
    return None


def _device_conflict(stored: str, incoming: str):
    """409 when ``incoming`` may not write, ``None`` when it may.

    An empty ``incoming`` is the old app (it sends no device at all) and is
    always allowed; the first non-empty id wins and only staff can release it.
    """
    if incoming and stored and incoming != stored:
        return Response(
            {"detail": DEVICE_LOCK_DETAIL, "device_id": stored},
            status=HTTPStatus.CONFLICT,
        )
    return None


def _requested_device(request: Request, data) -> str:
    """The device a write claims: the header first, then the body.

    The v2 client sends both (`X-Scorecard-Device` on every request and
    ``device_id`` in the setup payload); the old app sends neither.
    """
    device = request.headers.get("X-Scorecard-Device") or data.get("device_id")
    return str(device).strip() if device else ""


def _device_lock_response(request: Request, game_id, data=None):
    """409 when the calling device may not write this game, else ``None``.

    Every write to a game goes through this: a stale second tab must not be
    able to undo, start the second half, set possession or finalize a game
    that another device holds. A missing device id is still allowed (old app).
    """
    return _device_conflict(
        stored_device(game_id),
        _requested_device(request, request.data if data is None else data),
    )


def _client_id(raw):
    """``None`` when no id was sent (old app), a UUID, or a 400."""
    if raw in (None, ""):
        return None
    try:
        # A padded id (copy/paste, sloppy serializer) is still that id.
        return uuid.UUID(str(raw).strip())
    except (AttributeError, TypeError, ValueError):
        raise ValidationError({"client_id": "must be a UUID"})


def _submission_already_applied(game, client_id) -> bool:
    """Whether this submission has already written its rows.

    Both write endpoints accept the same outbox, and a retried op can land on
    the other one (the app moves from ``/api/gamelog/`` to
    ``/api/game/<id>/events`` between releases). The claim therefore has two
    homes: ``GameLogSubmission`` for the writes this endpoint took, and the
    event store's unique ``(game, client_id)`` for the ones the canonical
    endpoint took. The canonical endpoint checks this claim too: without the
    shadow there is no event to find for a v1 submission that is retried on
    the other endpoint. Checking only one home would write the rows twice.
    """
    if client_id is None:
        return False
    if GameLogSubmission.objects.filter(gameinfo=game, client_id=client_id).exists():
        return True
    return GameEvent.objects.filter(game=game, client_id=str(client_id)).exists()


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


class GameHalftimeAPIView(APIView):
    def put(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        try:
            game_service = GameService(pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        conflict = _device_lock_response(request, pk)
        if conflict is not None:
            return conflict
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
        conflict = _device_lock_response(request, pk)
        if conflict is not None:
            return conflict
        try:
            game_service.update_game_finished(request.user)
        except IllegalGameTransition as e:
            logger.warning("Rejected finalize for game %s: %s", pk, e)
            return Response(
                {"detail": "Dieser Spielstatus erlaubt kein Spielende."},
                status=HTTPStatus.CONFLICT,
            )
        # Historic duplicate setup rows must not raise MultipleObjectsReturned.
        game_setup = GameSetup.objects.filter(gameinfo_id=pk).order_by("pk").first()
        if game_setup is None:
            game_setup = GameSetup.objects.create(gameinfo_id=pk)
        serializer = GameFinalizer(instance=game_setup, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=HTTPStatus.OK)
        else:
            return Response(serializer.errors, status=HTTPStatus.BAD_REQUEST)


class GameDeviceLockAPIView(APIView):
    """Release the device lock of a game (staff only).

    Without this a lost or replaced phone would lock the game for good.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied(
                detail="Nur die Turnierleitung kann die Gerätesperre aufheben."
            )
        pk = kwargs.get("pk")
        try:
            game = Gameinfo.objects.get(pk=pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        game_setup = GameSetup.objects.filter(gameinfo=game).order_by("pk").first()
        if game_setup is None:
            raise NotFound(detail=f"No game setup found for gameId {pk}")
        release_device_lock(pk)
        return Response(status=HTTPStatus.NO_CONTENT)


class ConfigPenalties(APIView):
    """The penalty catalogue, projected from the rule definition.

    The response shape is the one the shipped scorecard reads (``name``,
    ``subtext``, ``isPenaltyAgainstOpponent``); only the definition may add
    rows. See :mod:`gameevents.service.rules`.
    """

    def get(self, request, *args, **kwargs):
        return Response(penalty_catalogue())


class ConfigRules(APIView):
    """The whole sport definition: the values the field app calculates with."""

    def get(self, request, *args, **kwargs):
        return Response(load_rules())
