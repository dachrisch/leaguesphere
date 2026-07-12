from http import HTTPStatus
from django.test import TestCase, Client
from django.urls import reverse

from gamedays.constants import LEAGUE_TOURNAMENT_DETAIL
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
        # 7. Gameresult prefetch
        # 8. Team prefetch (join through Gameresult)
        # 9. Base template context (league season config query)
        # Expected: 9 queries, flat regardless of size
        with self.assertNumQueries(9):
            response = self.client.get(url)
        self.assertEqual(response.status_code, HTTPStatus.OK)

    def test_tournament_detail_view_query_count_is_flat_large_tournament(self):
        tournament = self._create_tournament_with_games(rows=3, cols=3, games_per_col=5)

        url = reverse(LEAGUE_TOURNAMENT_DETAIL, kwargs={"pk": tournament.pk})

        # Query count for 3 rows, 3 columns, 5 games per column (45 total games):
        # Should be identical to small tournament (only 9 queries) — this is the critical test
        # that proves the query count is flat, not scaled by number of games/rows/columns
        with self.assertNumQueries(9):
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
