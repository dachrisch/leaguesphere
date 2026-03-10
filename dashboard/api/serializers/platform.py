from rest_framework import serializers


class PlatformHealthSerializer(serializers.Serializer):
    """Platform health metrics."""

    active_today = serializers.IntegerField()
    active_7d = serializers.IntegerField()
    trend_7d = serializers.FloatField()
    total_users = serializers.IntegerField()
    team_managers = serializers.IntegerField()
    officials = serializers.IntegerField()
    players = serializers.IntegerField()
    new_users_30d = serializers.IntegerField()
    avg_new_per_week = serializers.FloatField()


class RecentActionSerializer(serializers.Serializer):
    """Recent user activity."""

    action_type = serializers.CharField()
    action_time = serializers.DateTimeField()
    user_name = serializers.CharField()
    user_role = serializers.CharField()
    description = serializers.CharField()


class OnlineUserSerializer(serializers.Serializer):
    """Currently active user."""

    user_name = serializers.CharField()
    user_role = serializers.CharField()
    team = serializers.CharField()


class PublisherSerializer(serializers.Serializer):
    """Top publisher details."""

    name = serializers.CharField()
    count = serializers.IntegerField()


class TeamActivitySerializer(serializers.Serializer):
    """Team activity details."""

    name = serializers.CharField()
    changes = serializers.IntegerField()


class TeamActivityDetailSerializer(serializers.Serializer):
    """Detailed team activity."""

    name = serializers.CharField()
    roster_changes = serializers.IntegerField()
    verifications = serializers.IntegerField()
    total_activity = serializers.IntegerField()


class ContentCreationSerializer(serializers.Serializer):
    """Content creation statistics."""

    gamedays_published = serializers.IntegerField()
    avg_games_per_gameday = serializers.FloatField()
    top_publishers = PublisherSerializer(many=True)
    new_players = serializers.IntegerField()
    transfers = serializers.IntegerField()
    players_left = serializers.IntegerField()
    top_teams_roster = TeamActivitySerializer(many=True)
    verifications = serializers.IntegerField()


class FeatureUsageSerializer(serializers.Serializer):
    """Feature adoption metrics."""

    total_games = serializers.IntegerField()
    scorecard_adoption = serializers.FloatField()
    scorecard_games = serializers.IntegerField()
    scorecard_events = serializers.IntegerField()
    scorecard_avg_events = serializers.FloatField()
    liveticker_adoption = serializers.FloatField()
    liveticker_games = serializers.IntegerField()
    passcheck_verifications = serializers.IntegerField()
    passcheck_teams = serializers.IntegerField()


class RoleSegmentSerializer(serializers.Serializer):
    """User segment by role."""

    total = serializers.IntegerField()
    active_30d = serializers.IntegerField()
    activity_rate = serializers.FloatField()


class UserSegmentsSerializer(serializers.Serializer):
    """User segmentation data."""

    team_managers = RoleSegmentSerializer()
    officials = RoleSegmentSerializer()
    players = RoleSegmentSerializer()
    top_teams = TeamActivityDetailSerializer(many=True)


class InactiveUserSerializer(serializers.Serializer):
    """Inactive user details."""

    name = serializers.CharField()
    team = serializers.CharField()
    joined_days_ago = serializers.IntegerField(required=False)


class InactiveTeamSerializer(serializers.Serializer):
    """Inactive team details."""

    name = serializers.CharField()


class InactiveTeamManagersSerializer(serializers.Serializer):
    """Inactive team managers details."""

    total = serializers.IntegerField()
    never_active = InactiveUserSerializer(many=True)
    recently_inactive = InactiveUserSerializer(many=True)


class InactiveTeamsSerializer(serializers.Serializer):
    """Inactive teams details."""

    total = serializers.IntegerField()
    teams = InactiveTeamSerializer(many=True)


class ProblemAlertsSerializer(serializers.Serializer):
    """Problem alerts data."""

    inactive_team_managers = InactiveTeamManagersSerializer()
    inactive_teams = InactiveTeamsSerializer()
    unused_accounts = serializers.IntegerField()


class TeamUserCountSerializer(serializers.Serializer):
    """Team with user count."""

    team_name = serializers.CharField()
    user_count = serializers.IntegerField()
    association = serializers.CharField()


class UsersPerTeamSerializer(serializers.Serializer):
    """Users per team data."""

    teams = TeamUserCountSerializer(many=True)
    total_teams_with_users = serializers.IntegerField()
    total_users_with_teams = serializers.IntegerField()
    users_without_team = serializers.IntegerField()
