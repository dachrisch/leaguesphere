from rest_framework import serializers


class AdminStatsSerializer(serializers.Serializer):
    gamedays = serializers.IntegerField()
    teams = serializers.IntegerField()
    games = serializers.IntegerField()


class GamesPerLeagueSerializer(serializers.Serializer):
    league_name = serializers.CharField()
    league_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class TeamsPerLeagueSerializer(serializers.Serializer):
    league_name = serializers.CharField()
    league_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class TeamsPerAssociationSerializer(serializers.Serializer):
    association_name = serializers.CharField()
    association_id = serializers.IntegerField(required=False)
    count = serializers.IntegerField()


class RefereesPerTeamSerializer(serializers.Serializer):
    team_id = serializers.IntegerField()
    team_name = serializers.CharField()
    count = serializers.IntegerField()


class LeagueSeasonStatsSerializer(serializers.Serializer):
    season_id = serializers.IntegerField()
    season_name = serializers.CharField()
    gamedays_count = serializers.IntegerField()
    avg_teams_per_gameday = serializers.FloatField()
    avg_games_per_gameday = serializers.FloatField()


class LeagueHierarchySerializer(serializers.Serializer):
    league_id = serializers.IntegerField()
    league_name = serializers.CharField()
    seasons_count = serializers.IntegerField()
    total_gamedays = serializers.IntegerField()
    seasons = LeagueSeasonStatsSerializer(many=True)


class AdminDashboardSerializer(serializers.Serializer):
    stats = AdminStatsSerializer()
    games_per_league = GamesPerLeagueSerializer(many=True)
    teams_per_league = TeamsPerLeagueSerializer(many=True)
    teams_per_association = TeamsPerAssociationSerializer(many=True)
    referees_per_team = RefereesPerTeamSerializer(many=True)
    league_hierarchy = LeagueHierarchySerializer(many=True)
