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


class GamedaySummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    date = serializers.CharField()
    game_count = serializers.IntegerField()


class TeamEntrySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class LeagueSeasonStatsSerializer(serializers.Serializer):
    season_id = serializers.IntegerField()
    season_name = serializers.CharField()
    gamedays_count = serializers.IntegerField()
    avg_teams_per_gameday = serializers.FloatField()
    avg_games_per_gameday = serializers.FloatField()
    gamedays = GamedaySummarySerializer(many=True)


class LeagueHierarchySerializer(serializers.Serializer):
    league_id = serializers.IntegerField()
    league_name = serializers.CharField()
    seasons_count = serializers.IntegerField()
    total_gamedays = serializers.IntegerField()
    seasons = LeagueSeasonStatsSerializer(many=True)


class GamedayCalendarEntrySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    date = serializers.CharField()
    start = serializers.CharField(allow_null=True)
    league_name = serializers.CharField(allow_null=True)
    season_name = serializers.CharField(allow_null=True)
    status = serializers.CharField(allow_null=True)
    is_live = serializers.BooleanField()


class LiveGamedaySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    date = serializers.CharField()


class NextGamedaySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    date = serializers.CharField()
    days_until = serializers.IntegerField()


class GamedayScheduleSerializer(serializers.Serializer):
    gamedays = GamedayCalendarEntrySerializer(many=True)
    live_gameday = LiveGamedaySerializer(allow_null=True)
    next_gameday = NextGamedaySerializer(allow_null=True)


class AdminDashboardSerializer(serializers.Serializer):
    stats = AdminStatsSerializer()
    games_per_league = GamesPerLeagueSerializer(many=True)
    teams_per_league = TeamsPerLeagueSerializer(many=True)
    teams_per_association = TeamsPerAssociationSerializer(many=True)
    referees_per_team = RefereesPerTeamSerializer(many=True)
    league_hierarchy = LeagueHierarchySerializer(many=True)
    teams_list = TeamEntrySerializer(many=True)
    gameday_schedule = GamedayScheduleSerializer()
