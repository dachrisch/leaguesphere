"""
Serializers for Game Progress Dashboard API

Denormalizes Gameday + Gameinfo + Gameresult into flat structure
for real-time game progress visualization.
"""

from rest_framework import serializers
from gamedays.models import Gameday, Gameinfo, Gameresult


class GameResultSerializer(serializers.ModelSerializer):
    """Serializes game result (home/away teams and scores)"""

    class Meta:
        model = Gameresult
        fields = ['home_score', 'away_score', 'home', 'away']


class GameinfoProgressSerializer(serializers.ModelSerializer):
    """Serializes individual game (Gameinfo) with result"""

    result = GameResultSerializer(source='gameresult', read_only=True, required=False)

    class Meta:
        model = Gameinfo
        fields = [
            'id', 'scheduled', 'status', 'gameStarted', 'gameFinished',
            'field', 'stage', 'standing', 'result'
        ]


class GameProgressSerializer(serializers.ModelSerializer):
    """
    Serializes Gameday with all games denormalized.

    Converts hierarchical data (Gameday → Gameinfos → Gameresults)
    into flat structure suitable for game progress dashboard.
    """

    games = GameinfoProgressSerializer(
        source='gameinfo_set',
        many=True,
        read_only=True
    )
    league_display = serializers.CharField(source='league.name', read_only=True)
    season_display = serializers.CharField(source='season.name', read_only=True)

    class Meta:
        model = Gameday
        fields = [
            'id', 'name', 'date', 'start', 'status',
            'league', 'league_display',
            'season', 'season_display',
            'games'
        ]
