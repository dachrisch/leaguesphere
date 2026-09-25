import json

from django.utils.decorators import method_decorator
from django.views.decorators.http import condition
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from league_manager.utils.etag_cache import get_or_compute_by_etag
from league_table.service.league_table_service import LeagueTableService

# Columns of the computed standing worth exposing publicly. Game-level
# internals (opponent ids, per-game result columns) stay internal.
STANDING_COLUMNS = [
    "standing",
    "team_id",
    "team__description",
    "wins",
    "draws",
    "losses",
    "games_played",
    "pf",
    "pa",
    "diff",
    "win_points",
    "win_quotient",
    "league__name",
]


def generate_league_table_etag(request, league=None, season=None):
    from league_table.api.etag import generate_etag

    return generate_etag(request, league, season)


@method_decorator(condition(etag_func=generate_league_table_etag), name="get")
class LeagueTableAPIView(APIView):
    """Public, read-only standings for a league (and optional season)."""

    permission_classes = [AllowAny]

    def get(self, request, league, season=None):
        service = LeagueTableService.from_league_and_season(league, season)
        if service.league_season_config is None:
            return Response({"detail": "Unknown league or season."}, status=404)

        etag = generate_league_table_etag(request, league, season)

        def compute_payload():
            table = service.get_standing()
            columns = [c for c in STANDING_COLUMNS if c in table.columns]
            standing = json.loads(table[columns].to_json(orient="records"))
            return {
                "league": {"slug": league, "name": service.get_league_name()},
                "season": {
                    "slug": service.get_season_slug(),
                    "name": service.get_season_name(),
                },
                "standing": standing,
            }

        return Response(get_or_compute_by_etag(etag, compute_payload))
