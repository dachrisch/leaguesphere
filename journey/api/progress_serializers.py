from rest_framework import serializers
from gamedays.models import Gameday, Gameinfo, Gameresult


class GameResultProgressSerializer(serializers.ModelSerializer):
    """Serializes game result (score) for game progress dashboard."""

    team = serializers.CharField(source='team.name', read_only=True)
    is_home = serializers.BooleanField(source='isHome', read_only=True)

    class Meta:
        model = Gameresult
        fields = ['team', 'is_home', 'fh', 'sh', 'pa']
        read_only_fields = ['team', 'is_home', 'fh', 'sh', 'pa']


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
        """Return game results for both home and away teams."""
        results = obj.gameresult_set.all()
        if results:
            return GameResultProgressSerializer(results, many=True).data
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
        if obj.status:
            return None

        games = obj.gameinfo_set.all()
        if not games:
            return 'PUBLISHED'

        statuses = [game.status for game in games]
        all_completed = all(status == 'beendet' for status in statuses)

        return 'COMPLETED' if all_completed else 'PUBLISHED'
