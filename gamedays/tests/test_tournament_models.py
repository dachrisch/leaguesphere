from django.db import IntegrityError
from django.test import TestCase

from gamedays.models import Gameday, Gameinfo, Gameresult, Team
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


class TournamentModelTests(TestCase):
    def setUp(self):
        self.season = SeasonFactory(name="2024")
        self.league = LeagueFactory(name="Division 1")
        self.gameday = GamedayFactory(season=self.season, league=self.league)
        self.home_team = TeamFactory(name="Home Team", description="Home Team Desc")
        self.away_team = TeamFactory(name="Away Team", description="Away Team Desc")

    def test_tournament_str(self):
        tournament = TournamentFactory(name="Finals 2024")
        self.assertEqual(str(tournament), "Finals 2024")

    def test_tournament_row_str(self):
        tournament = TournamentFactory(name="Finals")
        row = TournamentRowFactory(tournament=tournament, order=1, title="Semifinals")
        expected = "Finals - Row 1: Semifinals"
        self.assertEqual(str(row), expected)

    def test_tournament_column_str(self):
        tournament = TournamentFactory(name="Finals")
        row = TournamentRowFactory(tournament=tournament, order=0)
        column = TournamentColumnFactory(row=row, order=2, title="Match 1")
        self.assertIn("/ Col 2: Match 1", str(column))

    def test_tournament_column_game_str(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        column = TournamentColumnFactory(row=row)
        gameinfo = GameinfoFactory(gameday=self.gameday)
        column_game = TournamentColumnGameFactory(
            column=column, gameinfo=gameinfo, order=1
        )
        self.assertIn(f"Gameinfo #{gameinfo.id}", str(column_game))

    def test_tournament_row_ordering(self):
        tournament = TournamentFactory()
        row3 = TournamentRowFactory(tournament=tournament, order=3)
        row1 = TournamentRowFactory(tournament=tournament, order=1)
        row2 = TournamentRowFactory(tournament=tournament, order=2)

        rows = list(tournament.rows.all())
        self.assertEqual(rows[0].id, row1.id)
        self.assertEqual(rows[1].id, row2.id)
        self.assertEqual(rows[2].id, row3.id)

    def test_tournament_column_ordering(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        col3 = TournamentColumnFactory(row=row, order=3)
        col1 = TournamentColumnFactory(row=row, order=1)
        col2 = TournamentColumnFactory(row=row, order=2)

        columns = list(row.columns.all())
        self.assertEqual(columns[0].id, col1.id)
        self.assertEqual(columns[1].id, col2.id)
        self.assertEqual(columns[2].id, col3.id)

    def test_tournament_column_game_ordering(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        column = TournamentColumnFactory(row=row)
        gameday1 = GamedayFactory(season=self.season, league=self.league)
        gameday2 = GamedayFactory(season=self.season, league=self.league)
        gameinfo1 = GameinfoFactory(gameday=gameday1)
        gameinfo2 = GameinfoFactory(gameday=gameday2)
        gameinfo3 = GameinfoFactory(gameday=gameday1)

        cg3 = TournamentColumnGameFactory(column=column, gameinfo=gameinfo3, order=3)
        cg1 = TournamentColumnGameFactory(column=column, gameinfo=gameinfo1, order=1)
        cg2 = TournamentColumnGameFactory(column=column, gameinfo=gameinfo2, order=2)

        games = list(column.column_games.all())
        self.assertEqual(games[0].id, cg1.id)
        self.assertEqual(games[1].id, cg2.id)
        self.assertEqual(games[2].id, cg3.id)

    def test_unique_constraint_same_gameinfo_per_column(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        column = TournamentColumnFactory(row=row)
        gameinfo = GameinfoFactory(gameday=self.gameday)

        TournamentColumnGameFactory(column=column, gameinfo=gameinfo)

        with self.assertRaises(IntegrityError):
            TournamentColumnGameFactory(column=column, gameinfo=gameinfo)

    def test_same_gameinfo_in_different_columns(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        col1 = TournamentColumnFactory(row=row, order=1)
        col2 = TournamentColumnFactory(row=row, order=2)
        gameinfo = GameinfoFactory(gameday=self.gameday)

        cg1 = TournamentColumnGameFactory(column=col1, gameinfo=gameinfo, order=1)
        cg2 = TournamentColumnGameFactory(column=col2, gameinfo=gameinfo, order=1)

        self.assertEqual(cg1.gameinfo.id, cg2.gameinfo.id)
        self.assertNotEqual(cg1.id, cg2.id)

    def test_cascade_delete_tournament_deletes_rows_and_columns(self):
        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        column = TournamentColumnFactory(row=row)
        gameinfo = GameinfoFactory(gameday=self.gameday)
        cg = TournamentColumnGameFactory(column=column, gameinfo=gameinfo)

        tournament_id = tournament.id
        row_id = row.id
        column_id = column.id
        cg_id = cg.id

        tournament.delete()

        from gamedays.models import (
            TournamentRow,
            TournamentColumn,
            TournamentColumnGame,
        )

        self.assertFalse(TournamentRow.objects.filter(id=row_id).exists())
        self.assertFalse(TournamentColumn.objects.filter(id=column_id).exists())
        self.assertFalse(TournamentColumnGame.objects.filter(id=cg_id).exists())
        self.assertTrue(Gameinfo.objects.filter(id=gameinfo.id).exists())

    def test_cascade_delete_gameinfo_removes_column_game(self):
        from gamedays.models import (
            TournamentColumnGame,
            Tournament,
            TournamentRow,
            TournamentColumn,
        )

        tournament = TournamentFactory()
        row = TournamentRowFactory(tournament=tournament)
        column = TournamentColumnFactory(row=row)
        gameinfo = GameinfoFactory(gameday=self.gameday)
        cg = TournamentColumnGameFactory(column=column, gameinfo=gameinfo)

        cg_id = cg.id
        gameinfo_id = gameinfo.id

        gameinfo.delete()

        self.assertFalse(TournamentColumnGame.objects.filter(id=cg_id).exists())
        self.assertTrue(TournamentColumn.objects.filter(id=column.id).exists())
        self.assertTrue(TournamentRow.objects.filter(id=row.id).exists())
        self.assertTrue(Tournament.objects.filter(id=tournament.id).exists())
