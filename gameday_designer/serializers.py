"""
Serializers for gameday_designer app.

Following TDD methodology (GREEN phase) - implementing serializers to pass tests.
Handles template serialization, validation, and nested relationships.
"""

from rest_framework import serializers
from django.contrib.auth.models import User

from gamedays.models import Gameday
from gameday_designer.models import (
    ScheduleTemplate,
    TemplateSlot,
    TemplateUpdateRule,
    TemplateUpdateRuleTeam,
    TemplateApplication,
)


class TemplateUpdateRuleTeamSerializer(serializers.ModelSerializer):
    """
    Serializer for TemplateUpdateRuleTeam.

    Handles team assignment rules within update rules.
    """

    class Meta:
        model = TemplateUpdateRuleTeam
        fields = ["id", "role", "standing", "place", "points", "pre_finished_override"]


class TemplateUpdateRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for TemplateUpdateRule.

    Includes nested team_rules for complete rule representation.
    """

    team_rules = TemplateUpdateRuleTeamSerializer(many=True, read_only=True)

    class Meta:
        model = TemplateUpdateRule
        fields = ["id", "slot", "pre_finished", "team_rules"]


class TemplateSlotSerializer(serializers.ModelSerializer):
    """
    Serializer for TemplateSlot.

    Handles both group/team placeholders and reference strings.
    Validates mutually exclusive placeholder types.
    """

    class Meta:
        model = TemplateSlot
        fields = [
            "id",
            "template",
            "field",
            "slot_order",
            "stage",
            "stage_type",
            "standing",
            "home_group",
            "home_team",
            "home_reference",
            "away_group",
            "away_team",
            "away_reference",
            "official_group",
            "official_team",
            "official_reference",
            "break_after",
        ]

    def validate(self, data):
        """
        Validate slot data.

        Ensures placeholders are mutually exclusive:
        - Cannot have both group/team AND reference for same role
        """
        errors = {}

        # Validate home team placeholders
        has_home_index = (
            data.get("home_group") is not None and data.get("home_team") is not None
        )
        has_home_ref = data.get("home_reference", "") != ""

        if has_home_index and has_home_ref:
            errors["home_reference"] = (
                "Cannot specify both home_group/home_team and home_reference"
            )

        # Validate away team placeholders
        has_away_index = (
            data.get("away_group") is not None and data.get("away_team") is not None
        )
        has_away_ref = data.get("away_reference", "") != ""

        if has_away_index and has_away_ref:
            errors["away_reference"] = (
                "Cannot specify both away_group/away_team and away_reference"
            )

        # Validate official placeholders
        has_official_index = (
            data.get("official_group") is not None
            and data.get("official_team") is not None
        )
        has_official_ref = data.get("official_reference", "") != ""

        if has_official_index and has_official_ref:
            errors["official_reference"] = (
                "Cannot specify both official_group/official_team and official_reference"
            )

        if errors:
            raise serializers.ValidationError(errors)

        return data


class ScheduleTemplateListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for template list views.

    Includes computed fields but no nested relationships.
    Optimized for performance in list endpoints.
    """

    association_name = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    updated_by_username = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            "id",
            "name",
            "description",
            "num_teams",
            "num_fields",
            "num_groups",
            "game_duration",
            "sharing",
            "association",
            "association_name",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "updated_by", "created_at", "updated_at"]

    def get_association_name(self, obj: ScheduleTemplate) -> str:
        """Get association abbreviation or 'Global' for global templates."""
        if obj.association:
            return obj.association.abbr
        return "Global"

    def get_created_by_username(self, obj: ScheduleTemplate) -> str:
        """Get username of creator or 'Unknown' if not set."""
        if obj.created_by:
            return obj.created_by.username
        return "Unknown"

    def get_updated_by_username(self, obj: ScheduleTemplate) -> str:
        """Get username of last updater or 'Unknown' if not set."""
        if obj.updated_by:
            return obj.updated_by.username
        return "Unknown"


class ScheduleTemplateDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for template detail views.

    Includes nested slots and update rules for complete template representation.
    Auto-populates created_by/updated_by from request.user.
    """

    slots = TemplateSlotSerializer(many=True, read_only=True)
    update_rules = TemplateUpdateRuleSerializer(many=True, read_only=True)
    association_name = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    updated_by_username = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleTemplate
        fields = [
            "id",
            "name",
            "description",
            "num_teams",
            "num_fields",
            "num_groups",
            "game_duration",
            "sharing",
            "association",
            "association_name",
            "created_by",
            "created_by_username",
            "updated_by",
            "updated_by_username",
            "created_at",
            "updated_at",
            "slots",
            "update_rules",
        ]
        read_only_fields = ["created_by", "updated_by", "created_at", "updated_at"]

    def get_association_name(self, obj: ScheduleTemplate) -> str:
        """Get association abbreviation or 'Global' for global templates."""
        if obj.association:
            return obj.association.abbr
        return "Global"

    def get_created_by_username(self, obj: ScheduleTemplate) -> str:
        """Get username of creator or 'Unknown' if not set."""
        if obj.created_by:
            return obj.created_by.username
        return "Unknown"

    def get_updated_by_username(self, obj: ScheduleTemplate) -> str:
        """Get username of last updater or 'Unknown' if not set."""
        if obj.updated_by:
            return obj.updated_by.username
        return "Unknown"

    def validate_sharing(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if value != ScheduleTemplate.SHARING_PRIVATE and not (user and user.is_staff):
            raise serializers.ValidationError(
                "Only staff can set sharing to association or global."
            )
        return value

    def create(self, validated_data):
        """
        Create template, auto-populating created_by and updated_by from request.

        Args:
            validated_data: Validated template data

        Returns:
            Created ScheduleTemplate instance
        """
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            validated_data["created_by"] = request.user
            validated_data["updated_by"] = request.user

        return super().create(validated_data)

    def update(self, instance, validated_data):
        """
        Update template, auto-populating updated_by from request.

        Args:
            instance: Existing ScheduleTemplate instance
            validated_data: Validated update data

        Returns:
            Updated ScheduleTemplate instance
        """
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            validated_data["updated_by"] = request.user

        return super().update(instance, validated_data)


class ApplyTemplateRequestSerializer(serializers.Serializer):
    """
    Serializer for template application request (/apply/ endpoint).

    Validates the request to apply a template to a gameday.
    """

    gameday_id = serializers.IntegerField(required=True)
    team_mapping = serializers.JSONField(required=True)
    start_time = serializers.TimeField(required=False, default=None)
    game_duration = serializers.IntegerField(required=False, min_value=1, default=None)
    break_duration = serializers.IntegerField(required=False, min_value=0, default=None)
    num_fields = serializers.IntegerField(required=False, min_value=1, default=None)

    def validate_gameday_id(self, value):
        """Validate that gameday exists."""
        if not Gameday.objects.filter(pk=value).exists():
            raise serializers.ValidationError(f"Gameday with ID {value} does not exist")
        return value

    def validate_team_mapping(self, value):
        """Validate that team_mapping is a dictionary."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("team_mapping must be a dictionary")
        return value


class TemplateApplicationSerializer(serializers.ModelSerializer):
    """
    Serializer for TemplateApplication audit records.

    Read-only serializer for viewing application history.
    """

    template_name = serializers.SerializerMethodField()
    gameday_name = serializers.SerializerMethodField()
    applied_by_username = serializers.SerializerMethodField()

    class Meta:
        model = TemplateApplication
        fields = [
            "id",
            "template",
            "template_name",
            "gameday",
            "gameday_name",
            "applied_at",
            "applied_by",
            "applied_by_username",
            "team_mapping",
        ]
        read_only_fields = fields  # All fields are read-only

    def get_template_name(self, obj: TemplateApplication) -> str:
        """Get template name."""
        return obj.template.name

    def get_gameday_name(self, obj: TemplateApplication) -> str:
        """Get gameday name."""
        return obj.gameday.name

    def get_applied_by_username(self, obj: TemplateApplication) -> str:
        """Get username of user who applied template."""
        if obj.applied_by:
            return obj.applied_by.username
        return "Unknown"


class SwissSetupRequestSerializer(serializers.Serializer):
    """
    Serializer for Swiss tournament setup
    (POST /api/designer/gamedays/<gameday_id>/swiss/setup/).

    seed_team_ids is the pre-tournament rank order (best first); it stays
    fixed while pairings change each round. Ranges mirror the setup screen
    (rounds 2-8, fields 1-4, duration 15-60 min).
    """

    seed_team_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=2
    )
    rounds = serializers.IntegerField(min_value=2, max_value=8)
    fields = serializers.IntegerField(min_value=1, max_value=4)
    game_duration = serializers.IntegerField(min_value=15, max_value=60)
    round_start_overrides = serializers.DictField(
        child=serializers.RegexField(regex=r"^\d{2}:\d{2}$"),
        required=False,
        default=dict,
    )


class SwissGenerateOverridePairingSerializer(serializers.Serializer):
    """
    One manually confirmed pairing inside a generate-round override envelope.

    Field/time default to the round's slot when omitted; deep validation
    (team coverage, field range, real clock time) lives in
    SwissTournamentService, which knows the tournament config.
    """

    home_team_id = serializers.IntegerField(min_value=1)
    away_team_id = serializers.IntegerField(min_value=1)
    field = serializers.IntegerField(min_value=1, required=False)
    start_time = serializers.RegexField(regex=r"^\d{2}:\d{2}$", required=False)


class SwissRoundTimesRequestSerializer(serializers.Serializer):
    """
    Round start-time updates
    (POST /api/designer/gamedays/<gameday_id>/swiss/round-times/).

    Light shape validation only (HH:MM pattern per entry); semantic checks
    (round 1..rounds_total, real clock time) live in
    SwissTournamentService, which knows the tournament config.
    """

    round_start_overrides = serializers.DictField(
        child=serializers.RegexField(regex=r"^\d{2}:\d{2}$"),
    )


class SwissGenerateOverridesSerializer(serializers.Serializer):
    """
    Full-manual round override envelope
    (POST /api/designer/gamedays/<gameday_id>/swiss/generate-round/).

    Pairings must cover every seed team exactly once (plus bye_team_id for
    odd team counts); the service rejects unknown/duplicate teams, a paired
    bye team, out-of-range fields, and bad times.
    """

    pairings = serializers.ListField(
        child=SwissGenerateOverridePairingSerializer(), min_length=1
    )
    bye_team_id = serializers.IntegerField(
        min_value=1, required=False, allow_null=True, default=None
    )
