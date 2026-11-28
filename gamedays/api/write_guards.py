"""Write guards shared by every endpoint that writes a game's log.

Public API of ``gamedays`` for its write surface: ``POST /api/gamelog`` and the
other scorecard writes in this package, and the canonical event endpoint in
``gameevents`` (``POST /api/game/<id>/events``). One lock, one finished-game
refusal and one payload check for both paths, so a stale tab is refused the
same way whichever endpoint it hits. Callers outside ``gamedays`` import from
here, never from the view modules (architecture scan 2026-11-28, B2).
"""

from http import HTTPStatus

from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from gamedays.service.device_lock import stored_device

DEVICE_LOCK_DETAIL = "Dieses Spiel läuft auf einem anderen Gerät."
GAME_FINISHED_DETAIL = "Dieses Spiel ist beendet."


def finished_game_response(game) -> Response | None:
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


def device_conflict(stored: str, incoming: str):
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


def requested_device(request: Request, data) -> str:
    """The device a write claims: the header first, then the body.

    The v2 client sends both (`X-Scorecard-Device` on every request and
    ``device_id`` in the setup payload); the old app sends neither.
    """
    device = request.headers.get("X-Scorecard-Device") or data.get("device_id")
    return str(device).strip() if device else ""


def device_lock_response(request: Request, game_id, data=None):
    """409 when the calling device may not write this game, else ``None``.

    Every write to a game goes through this: a stale second tab must not be
    able to undo, start the second half, set possession or finalize a game
    that another device holds. A missing device id is still allowed (old app).
    """
    return device_conflict(
        stored_device(game_id),
        requested_device(request, request.data if data is None else data),
    )


def validate_gamelog_payload(data):
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
