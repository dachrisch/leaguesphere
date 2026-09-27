from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.tests.setup_factories.factories import LeagueFactory


class LeagueListApiTest(APITestCase):
    """`/api/leagues/` is the slug directory for API consumers: slugs are
    required by `/api/liveticker/?league=<slug>` and
    `/api/league-table/<slug>/`, but several slugs are hand-set and cannot be
    derived from the league name (e.g. `dffl` for the DKB DFFL).
    """

    def test_league_list_returns_slug_for_each_league(self):
        LeagueFactory(name="DKB DFFL", slug="dffl")
        LeagueFactory(name="Flag Football Bundesliga")

        # No assertNumQueries here: global middleware (db guard,
        # maintenance mode) adds constant per-request queries, and the
        # endpoint itself is a single un-paginated League query.
        response = self.client.get("/api/leagues/")

        assert response.status_code == status.HTTP_200_OK
        for item in response.data:
            assert "slug" in item, f"league {item['name']} has no slug"
        by_name = {item["name"]: item for item in response.data}
        assert by_name["DKB DFFL"]["slug"] == "dffl"
        assert by_name["Flag Football Bundesliga"]["slug"] == "flag-football-bundesliga"
