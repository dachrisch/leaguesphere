from rest_framework import serializers
from gamedays.models import Gameresult, Gameinfo


class GameResultSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = Gameresult
        fields = ["id", "team_id", "team_name", "fh", "sh", "pa", "isHome"]


class GameResultsUpdateSerializer(serializers.Serializer):
    results = GameResultSerializer(many=True)

    def update(self, instance, validated_data):
        results_data = validated_data.get("results", [])
        for result_data in results_data:
            try:
                result = Gameresult.objects.get(
                    gameinfo=instance, isHome=result_data["isHome"]
                )
                result.fh = result_data.get("fh", result.fh)
                result.sh = result_data.get("sh", result.sh)
                result.pa = result_data.get("pa", result.pa)
                result.save()
            except Gameresult.DoesNotExist:
                pass
        return instance


class GameInfoSerializer(serializers.ModelSerializer):
    """Serializer for displaying game info with results"""

    results = serializers.SerializerMethodField()

    class Meta:
        model = Gameinfo
        fields = [
            "id",
            "gameday",
            "scheduled",
            "field",
            "officials",
            "stage",
            "standing",
            "status",
            "is_locked",
            "results",
        ]
        read_only_fields = [
            "id",
            "gameday",
            "results",
        ]

    def get_results(self, obj):
        """Get all results for this game"""
        results = Gameresult.objects.filter(gameinfo=obj)
        return GameResultSerializer(results, many=True).data
