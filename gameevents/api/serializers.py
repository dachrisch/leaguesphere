"""Request validation for ``POST /api/game/<id>/events``.

Two bodies are accepted, because the app may switch at its own pace:

- ``{"event": [{name, player?, input?}], "team": ..., "half": 1|2, ...}`` --
  the legacy ``POST /api/gamelog`` payload, unchanged, translated server-side;
- ``{"events": [{type, code, side, player, period, payload, client_id, seq?}]}``
  -- the envelope list, for a client that already speaks events.

Structural errors are 400s. Semantic errors (unknown type/code, bad target)
surface from the projector as ``InvalidEnvelope``/``UnsupportedEventCode``,
which the view also maps to 400.
"""

import uuid
from dataclasses import dataclass, field
from typing import Optional

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from gameevents.service.append import normalise_client_id


class EventEnvelopeSerializer(serializers.Serializer):
    type = serializers.CharField(max_length=32)
    code = serializers.CharField(
        required=False, allow_blank=True, max_length=64, default=""
    )
    side = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=8
    )
    player = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=32767
    )
    period = serializers.IntegerField(required=False, min_value=1)
    payload = serializers.DictField(required=False, default=dict)
    client_id = serializers.CharField(
        required=False, allow_blank=True, max_length=64
    )
    seq = serializers.IntegerField(required=False, min_value=1)


@dataclass(frozen=True)
class EventRequest:
    """What the view needs, after structural validation."""

    mode: str  # "envelope" | "legacy"
    client_id: str
    events: list = field(default_factory=list)
    entries: list = field(default_factory=list)
    team: Optional[str] = None
    half: Optional[int] = None
    game_id: Optional[int] = None


def _game_id(data) -> Optional[int]:
    raw = data.get("gameId")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"gameId": "must be an integer"})


def parse_event_request(data) -> EventRequest:
    if not isinstance(data, dict):
        raise ValidationError({"detail": "a JSON object is required"})

    has_envelopes = "events" in data
    has_legacy = "event" in data
    if has_envelopes == has_legacy:
        raise ValidationError(
            {
                "detail": "send exactly one of 'events' (envelopes) or "
                "'event' (the legacy gamelog payload)"
            }
        )

    client_id = normalise_client_id(data.get("client_id"))
    game_id = _game_id(data)

    if has_legacy:
        # The canonical endpoint accepts the app's payload unchanged, so it
        # uses the same payload validation as the gamelog view.
        from gamedays.api.game_views import _validate_gamelog_payload

        _validate_gamelog_payload(data)
        if data.get("team") in (None, ""):
            raise ValidationError({"team": "is required for a legacy payload"})
        return EventRequest(
            mode="legacy",
            client_id=client_id or str(uuid.uuid4()),
            entries=data["event"],
            team=data.get("team"),
            half=data["half"],
            game_id=game_id,
        )

    raw = data["events"]
    if not isinstance(raw, list) or not raw:
        raise ValidationError({"events": "must be a non-empty list of event objects"})
    serializer = EventEnvelopeSerializer(data=raw, many=True)
    serializer.is_valid(raise_exception=True)
    events = serializer.validated_data
    ids = {event["client_id"] for event in events if event.get("client_id")}
    if len(ids) > 1:
        raise ValidationError(
            {"client_id": "all events of one submission share one client_id"}
        )
    if ids:
        event_client_id = normalise_client_id(ids.pop())
        if (
            client_id is not None
            and event_client_id is not None
            and client_id != event_client_id
        ):
            raise ValidationError(
                {
                    "client_id": "the request's client_id contradicts the events' "
                    "client_id"
                }
            )
        client_id = event_client_id or client_id
    return EventRequest(
        mode="envelope",
        client_id=client_id or str(uuid.uuid4()),
        events=events,
        game_id=game_id,
    )
