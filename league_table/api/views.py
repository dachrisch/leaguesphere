from django.utils.decorators import method_decorator
from django.views.decorators.http import condition
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from league_table.api.standings import standing_rows
from league_table.service.league_table_service import LeagueTableService


def generate_league_table_etag(request, league=None, season=None):
    from league_table.api.etag import generate_etag

    return generate_etag(request, league, season)


@method_decorator(condition(etag_func=generate_league_table_etag), name="get")
class LeagueTableAPIView(APIView):
    """Read-only standings for a league (and optional season).

    Anonymous but internal: serves LeagueSphere's own pages. The public,
    cross-origin readable contract is /api/snapshot/?include=standings.
    """

    permission_classes = [AllowAny]

    def get(self, request, league, season=None):
        service = LeagueTableService.from_league_and_season(league, season)
        if service.league_season_config is None:
            return Response({"detail": "Unknown league or season."}, status=404)

        standing = standing_rows(service)

        return Response(
            {
                "league": {"slug": league, "name": service.get_league_name()},
                "season": {
                    "slug": service.get_season_slug(),
                    "name": service.get_season_name(),
                },
                "standing": standing,
            }
        )
