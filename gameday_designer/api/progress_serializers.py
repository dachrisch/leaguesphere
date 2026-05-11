from rest_framework import serializers
from gamedays.models import Gameday, Gameinfo, Gameresult


class GameResultProgressSerializer(serializers.ModelSerializer):
    """Serializes game result (score) for game progress dashboard."""

    class Meta:
        model = Gameresult
        fields = ['home_score', 'guest_score']
        read_only_fields = ['home_score', 'guest_score']


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
        """Return the first gameresult if it exists."""
        result = obj.gameresult_set.first()
        if result:
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
        ]
        read_only_fields = fields
