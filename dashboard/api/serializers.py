from rest_framework import serializers


class LiveGameSerializer(serializers.Serializer):
    """Live game data (non-model serializer)."""

    game_id = serializers.IntegerField()
    home_team = serializers.CharField()
    away_team = serializers.CharField()
    status = serializers.CharField()
    score = serializers.JSONField()
    league = serializers.CharField()
    gameday = serializers.CharField()


class DashboardSummarySerializer(serializers.Serializer):
    """Overall statistics (non-model serializer)."""

    total_games = serializers.IntegerField()
    live_games = serializers.IntegerField()
    total_teams = serializers.IntegerField()
    total_players = serializers.IntegerField()
    completion_rate = serializers.DecimalField(max_digits=5, decimal_places=2)


class LeagueStatsSerializer(serializers.Serializer):
    """League-level statistics."""

    league_id = serializers.IntegerField()
    league_name = serializers.CharField()
    total_games = serializers.IntegerField()
    total_teams = serializers.IntegerField()
    completion_rate = serializers.DecimalField(max_digits=5, decimal_places=2)


class SeasonStatsSerializer(serializers.Serializer):
    """Season-level statistics."""

    season_id = serializers.IntegerField()
    season_name = serializers.CharField()
    total_games = serializers.IntegerField()
    completion_rate = serializers.DecimalField(max_digits=5, decimal_places=2)


class AssociationStatsSerializer(serializers.Serializer):
    """Association-level statistics."""

    association_id = serializers.IntegerField()
    association_name = serializers.CharField()
    total_leagues = serializers.IntegerField()
    total_games = serializers.IntegerField()
    total_teams = serializers.IntegerField()
    completion_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
