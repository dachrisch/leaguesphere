from rest_framework import serializers
from gamedays.models import Gameday, Gameinfo, Gameresult


class GameResultProgressSerializer(serializers.ModelSerializer):
    """Serializes game result (score) for game progress dashboard."""

    class Meta:
        model = Gameresult
        fields = ['fh', 'sh', 'pa']
        read_only_fields = ['fh', 'sh', 'pa']


class GameinfoProgressSerializer(serializers.ModelSerializer):
    """Serializes individual game within a gameday."""

    gameresult = serializers.SerializerMethodField()

    class Meta:
        model = Gameinfo
        fields = [
            'id',
            'field',
            'scheduled',
            'status',
            'gameStarted',
            'gameFinished',
            'gameresult',
        ]
        read_only_fields = fields

    def get_gameresult(self, obj):
        """Return the home team gameresult if it exists."""
        for result in obj.gameresult_set.all():
            if result.isHome:
                return GameResultProgressSerializer(result).data
        return None


class GamedayProgressSerializer(serializers.ModelSerializer):
    """
    Serializes gameday with all games denormalized for progress dashboard.
    Aggregates hierarchical data (Gameday → Gameinfos → Gameresults)
    into a flat structure suitable for real-time progress tracking.
    """

    games = GameinfoProgressSerializer(
        source='gameinfo_set',
        many=True,
        read_only=True,
    )
    league_display = serializers.CharField(source='league.name', read_only=True)
    season_display = serializers.CharField(source='season.name', read_only=True)
    computed_status = serializers.SerializerMethodField()

    class Meta:
        model = Gameday
        fields = [
            'id',
            'name',
            'date',
            'start',
            'status',
            'league',
            'league_display',
            'season',
            'season_display',
            'games',
            'computed_status',
        ]
        read_only_fields = fields

    def get_computed_status(self, obj):
        """Compute status from games when Gameday.status is empty."""
        gameday_has_status = obj.status is not None and obj.status != ''
        if gameday_has_status:
            return None

        games_list = list(obj.gameinfo_set.all())
        if not games_list:
            return 'PUBLISHED'

        all_completed = all(game.status == Gameinfo.STATUS_COMPLETED for game in games_list)
        return 'COMPLETED' if all_completed else 'PUBLISHED'
