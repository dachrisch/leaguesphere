import json
import re

from rest_framework import serializers
from .models import Journey, JourneyEvent

# Event names follow a loose "<area>_<action>" convention (gameday_created,
# gd_tour_manual_build_started, template_used, ...) that grows as features
# are added - a fixed enum would go stale immediately. This just rejects
# garbage/injection-shaped values while allowing the convention through.
EVENT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")

MAX_METADATA_BYTES = 4096


class JourneyEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = JourneyEvent
        fields = ["id", "event_name", "metadata", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_event_name(self, value):
        if not EVENT_NAME_PATTERN.match(value):
            raise serializers.ValidationError(
                "event_name must contain only letters, digits and underscores."
            )
        return value

    def validate_metadata(self, value):
        size = len(json.dumps(value))
        if size > MAX_METADATA_BYTES:
            raise serializers.ValidationError(
                f"metadata must be at most {MAX_METADATA_BYTES} bytes serialized (got {size})."
            )
        return value


class JourneySerializer(serializers.ModelSerializer):
    events = JourneyEventSerializer(many=True, read_only=True)

    class Meta:
        model = Journey
        fields = ["id", "user", "started_at", "ended_at", "events"]
        read_only_fields = ["id", "started_at", "ended_at"]
