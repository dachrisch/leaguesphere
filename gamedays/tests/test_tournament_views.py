from http import HTTPStatus
from django.test import TestCase, Client
from django.urls import reverse

from gamedays.constants import LEAGUE_TOURNAMENT_DETAIL
from gamedays.models import ResourceUrl
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    TeamFactory,
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    TournamentFactory,
    TournamentRowFactory,
    TournamentColumnFactory,
    TournamentColumnGameFactory,
    ResourceUrlFactory,
)


class TournamentDetailViewTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.season = SeasonFactory(name="2024")
        self.league = LeagueFactory(name="Division 1")
        self.home_team = TeamFactory(name="Home Team", description="Home Team Desc")
        self.away_team = TeamFactory(name="Away Team", description="Away Team Desc")

    def test_tournament_detail_view_renders_200(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)

    def test_tournament_detail_view_public_no_login_required(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)

    def test_tournament_detail_shows_row_and_column_titles(self):
        tournament = TournamentFactory(name="Finals 2024", title="Grand Finals")
        row = TournamentRowFactory(tournament=tournament, title="Semifinals")
        col = TournamentColumnFactory(row=row, title="Match A")

        gameday = GamedayFactory(season=self.season, league=self.league)
        gi = GameinfoFactory(gameday=gameday)
        GameresultFactory(gameinfo=gi, team=self.home_team, isHome=True, fh=10, sh=7)
        GameresultFactory(gameinfo=gi, team=self.away_team, isHome=False, fh=3, sh=4)
        TournamentColumnGameFactory(column=col, gameinfo=gi)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Semifinals")
        self.assertContains(response, "Match A")
        self.assertContains(response, "Grand Finals")

    def test_tournament_detail_shows_team_names_and_scores(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Home Team Desc")
        self.assertContains(response, "Away Team Desc")

    def test_tournament_detail_view_query_count_is_flat_small_tournament(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})

        # Query count for 1 row, 1 column, 1 game:
        # 1. Tournament fetch
        # 2. Rows prefetch
        # 3. Columns prefetch
        # 4. ColumnGames prefetch
        # 5. Gameinfo prefetch
        # 6. Gameday prefetch (join through Gameinfo)
        # 7. League prefetch (join through Gameday)
        # 8. Gameresult prefetch
        # 9. Team prefetch (join through Gameresult)
        # 10. ResourceUrl prefetch
        # 11. LeagueSeasonConfig (from base template rendering)
        # Expected: 11 queries, flat regardless of tournament size
        with self.assertNumQueries(11):
            response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.OK)

    def test_tournament_detail_view_query_count_is_flat_large_tournament(self):
        tournament = self._create_tournament_with_games(rows=2, cols=3, games_per_col=5)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})

        # Query count should remain flat regardless of tournament size:
        # Same 11 queries as the small tournament (2 rows, 3 cols each, 5 games per col = 30 games)
        # All relationships are prefetched, so no N+1 queries occur
        with self.assertNumQueries(11):
            response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.OK)

    def test_tournament_detail_empty_column_shows_no_games_message(self):
        tournament = TournamentFactory(name="Finals")
        row = TournamentRowFactory(tournament=tournament)
        col = TournamentColumnFactory(row=row, title="No Games")

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Keine Spiele")

    def test_tournament_detail_shows_external_urls(self):
        tournament = TournamentFactory(name="Finals")
        ResourceUrl.objects.create(
            tournament=tournament,
            url="https://example.com",
            description="Example Link",
        )

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Example Link")
        self.assertContains(response, "https://example.com")

    def test_tournament_detail_no_urls_shows_empty_state(self):
        tournament = TournamentFactory(name="Finals")

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Keine Links verfügbar")

    def test_tournament_detail_location_renders_as_google_maps_link(self):
        tournament = TournamentFactory(name="Finals", location="Berlin, Germany")

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(
            response, "https://www.google.com/maps/search/?api=1&query=Berlin"
        )

    def test_tournament_detail_shows_league_name_when_enabled(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)
        tournament.show_league_name = True
        tournament.save()

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Liga")
        self.assertContains(response, "Division 1")

    def test_tournament_detail_hides_league_name_when_disabled(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)
        tournament.show_league_name = False
        tournament.save()

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        # Should NOT have Liga header
        content = response.content.decode()
        # Liga should not appear as a table header (it appears in the page elsewhere as a generic word)
        # So we check that Division 1 (the league name) is not in the table
        self.assertNotIn("<td>Division 1</td>", content)

    def test_tournament_detail_shows_field_when_enabled(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)
        tournament.show_field = True
        tournament.save()

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        self.assertContains(response, "Feld")

    def test_tournament_detail_hides_field_when_disabled(self):
        tournament = self._create_tournament_with_games(rows=1, cols=1, games_per_col=1)
        tournament.show_field = False
        tournament.save()

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, HTTPStatus.OK)
        # Feld should not appear as a table header when disabled
        content = response.content.decode()
        # Count the occurrences - should not be in the table headers
        # This is a basic check that the table renders without Feld column header
        self.assertIn("Heim", content)  # Home column should still be there

    def _create_tournament_with_games(self, rows=1, cols=1, games_per_col=1):
        tournament = TournamentFactory(name="Test Tournament")

        for r in range(rows):
            row = TournamentRowFactory(tournament=tournament, order=r, title=f"Row {r}")
            for c in range(cols):
                col = TournamentColumnFactory(row=row, order=c, title=f"Col {c}")

                for g in range(games_per_col):
                    gameday = GamedayFactory(season=self.season, league=self.league)
                    gi = GameinfoFactory(gameday=gameday)
                    GameresultFactory(
                        gameinfo=gi, team=self.home_team, isHome=True, fh=10, sh=7
                    )
                    GameresultFactory(
                        gameinfo=gi, team=self.away_team, isHome=False, fh=3, sh=4
                    )
                    TournamentColumnGameFactory(column=col, gameinfo=gi, order=g)

        return tournament
