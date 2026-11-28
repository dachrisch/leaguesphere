import logging
import uuid
from http import HTTPStatus

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import UpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.models import GameEvent
from gameevents.service.rules import load_rules, penalty_catalogue
from gamedays.api.serializers import GameFinalizer
from gamedays.api.write_guards import device_lock_response
from gamedays.models import Gameinfo, GameSetup, GameLogSubmission
from gamedays.service.device_lock import release_device_lock
from gamedays.service.game_service import GameService
from gamedays.service.wrapper.gameinfo_wrapper import IllegalGameTransition

# Keep the historical logger name: L3 preserved `officials.views` for the
# same kind of move, and log queries must keep matching the old emitter.
logger = logging.getLogger("gamedays.api.game_views")


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


class GameHalftimeAPIView(APIView):
    def put(self, request, *args, **kwargs):
        pk = kwargs.get("pk")
        try:
            game_service = GameService(pk)
        except Gameinfo.DoesNotExist:
            raise NotFound(detail=f"No game found for gameId {pk}")
        conflict = device_lock_response(request, pk)
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
        conflict = device_lock_response(request, pk)
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
