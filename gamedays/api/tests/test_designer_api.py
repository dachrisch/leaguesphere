from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from gamedays.models import Gameday, Gameinfo, GamedayDesignerState
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import LeagueFactory, SeasonFactory


class DesignerAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="password")
        self.client.force_authenticate(user=self.user)
        self.db_setup = DBSetup()
        self.db_setup.g62_status_empty()
        self.gameday = Gameday.objects.first()

    def test_get_designer_state(self):
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data={"nodes": [{"id": "1"}], "edges": []}
        )
        url = f"/api/gamedays/{self.gameday.id}/designer-state/"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["state_data"]["nodes"][0]["id"] == "1"

    def test_update_designer_state(self):
        url = f"/api/gamedays/{self.gameday.id}/designer-state/"
        data = {"state_data": {"nodes": [{"id": "2"}], "edges": []}}
        response = self.client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK
        state = GamedayDesignerState.objects.get(gameday=self.gameday)
        assert state.state_data["nodes"][0]["id"] == "2"

    def test_get_designer_state_seeds_metadata_from_gameday_when_state_is_empty(self):
        """For a new gameday with no stored state_data, GET should return metadata
        seeded from the Gameday model so the designer form shows correct defaults."""
        url = f"/api/gamedays/{self.gameday.id}/designer-state/"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        metadata = response.data["state_data"]["metadata"]
        assert metadata["name"] == self.gameday.name
        assert str(metadata["date"]) == str(self.gameday.date)
        assert metadata["status"] == self.gameday.status

    def test_update_designer_state_syncs_league_and_season_to_gameday(self):
        """Changing league/season in the designer must persist to the Gameday
        model's FKs, not just the state_data JSON blob -- backend code that reads
        gameday.league/gameday.season directly (schedule resolution, league
        tables, passcheck, ...) would otherwise keep seeing the old value.
        Regression test for #1565."""
        new_league = LeagueFactory(name="e2e_test_league_2")
        new_season = SeasonFactory(name=f"{self.gameday.season.name}-alt")
        assert self.gameday.league_id != new_league.id
        assert self.gameday.season_id != new_season.id

        url = f"/api/gamedays/{self.gameday.id}/designer-state/"
        data = {
            "state_data": {
                "metadata": {"league": new_league.id, "season": new_season.id}
            }
        }
        response = self.client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK

        self.gameday.refresh_from_db()
        assert self.gameday.league_id == new_league.id
        assert self.gameday.season_id == new_season.id

    def test_update_designer_state_ignores_placeholder_zero_league_and_season(self):
        """The designer's initial (not-yet-loaded) local state defaults league
        and season to 0, which is not a valid FK. A save racing ahead of the
        real state must not attempt to point the gameday at League/Season pk 0."""
        original_league_id = self.gameday.league_id
        original_season_id = self.gameday.season_id

        url = f"/api/gamedays/{self.gameday.id}/designer-state/"
        data = {"state_data": {"metadata": {"league": 0, "season": 0}}}
        response = self.client.put(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK

        self.gameday.refresh_from_db()
        assert self.gameday.league_id == original_league_id
        assert self.gameday.season_id == original_season_id

    def test_publish_gameday(self):
        # Publishing regenerates the schedule from the designer canvas, so it is
        # only allowed when no results have been entered yet. The g62 fixture ships
        # with scored games, so start this happy-path check from a clean slate.
        Gameinfo.objects.filter(gameday=self.gameday).delete()
        self.gameday.status = Gameday.STATUS_DRAFT
        self.gameday.save()
        url = f"/api/gamedays/{self.gameday.id}/publish/"
        response = self.client.post(url)
        assert response.status_code == status.HTTP_200_OK
        self.gameday.refresh_from_db()
        assert self.gameday.status == Gameday.STATUS_PUBLISHED
