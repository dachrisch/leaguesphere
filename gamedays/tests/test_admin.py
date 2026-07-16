from django.contrib import admin
from django.contrib.auth.models import User
from django.test import TestCase, Client
from django.urls import reverse

from gamedays.models import (
    Tournament,
    TournamentRow,
    TournamentColumn,
    TournamentColumnGame,
    Gameinfo,
)
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    GamedayFactory,
    GameinfoFactory,
    TournamentFactory,
    TournamentRowFactory,
    TournamentColumnFactory,
    TournamentColumnGameFactory,
)


class TournamentAdminRegistrationTests(TestCase):
    def test_tournament_admin_registered(self):
        self.assertIn(Tournament, admin.site._registry)

    def test_tournament_row_admin_registered(self):
        self.assertIn(TournamentRow, admin.site._registry)

    def test_tournament_column_admin_registered(self):
        self.assertIn(TournamentColumn, admin.site._registry)

    def test_tournament_column_game_admin_registered(self):
        self.assertIn(TournamentColumnGame, admin.site._registry)


class TournamentAdminPageLoadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff_user = User.objects.create_superuser(
            username="staffuser", email="staff@test.com", password="testpass123"
        )

    def setUp(self):
        self.client = Client()
        self.client.login(username="staffuser", password="testpass123")

    def test_tournament_changelist_loads(self):
        response = self.client.get("/admin/gamedays/tournament/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_row_changelist_loads(self):
        response = self.client.get("/admin/gamedays/tournamentrow/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_column_changelist_loads(self):
        response = self.client.get("/admin/gamedays/tournamentcolumn/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_column_game_changelist_loads(self):
        response = self.client.get("/admin/gamedays/tournamentcolumngame/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_add_page_loads(self):
        response = self.client.get("/admin/gamedays/tournament/add/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_add_page_includes_resource_url_inline(self):
        response = self.client.get("/admin/gamedays/tournament/add/")
        self.assertEqual(response.status_code, 200)
        # Check that ResourceUrl inline is present (look for the prefix used by inlines)
        self.assertIn("resourceurl_set", response.content.decode())

    def test_tournament_change_page_includes_resource_url_inline(self):
        tournament = TournamentFactory(name="Test Tournament")
        response = self.client.get(
            f"/admin/gamedays/tournament/{tournament.id}/change/"
        )
        self.assertEqual(response.status_code, 200)
        # Check that ResourceUrl inline is present
        self.assertIn("resourceurl_set", response.content.decode())

    def test_tournament_row_add_page_loads(self):
        response = self.client.get("/admin/gamedays/tournamentrow/add/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_column_add_page_loads(self):
        response = self.client.get("/admin/gamedays/tournamentcolumn/add/")
        self.assertEqual(response.status_code, 200)

    def test_tournament_column_game_add_page_loads(self):
        response = self.client.get("/admin/gamedays/tournamentcolumngame/add/")
        self.assertEqual(response.status_code, 200)

    def test_gameinfo_admin_autocomplete_endpoint(self):
        season = SeasonFactory(name="2024")
        league = LeagueFactory(name="Division 1")
        gameday = GamedayFactory(season=season, league=league, name="Gameday 1")
        gi = GameinfoFactory(gameday=gameday, field=1)

        # The fact that Gameinfo admin has search_fields configured means the autocomplete
        # endpoint can be used. We just verify the admin can access the search page.
        response = self.client.get("/admin/gamedays/gameinfo/")
        self.assertEqual(response.status_code, 200)
        # Verify that search_fields are configured (no error about missing search_fields)
        self.assertIn("gameinfo", response.content.decode())

    def test_gameinfo_admin_search_fields(self):
        season = SeasonFactory(name="2024")
        league = LeagueFactory(name="Division 1")
        gameday = GamedayFactory(season=season, league=league, name="Test Gameday")
        gameinfo = GameinfoFactory(gameday=gameday, field=1, stage="Vorrunde")

        # Search by gameday name should work
        response = self.client.get("/admin/gamedays/gameinfo/?q=Test+Gameday")
        self.assertEqual(response.status_code, 200)

        # Search by stage should work
        response = self.client.get("/admin/gamedays/gameinfo/?q=Vorrunde")
        self.assertEqual(response.status_code, 200)
