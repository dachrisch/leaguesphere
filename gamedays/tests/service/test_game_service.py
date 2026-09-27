import re
import threading
import time
import unittest
from unittest import mock

from django.db import connection
from django.test import TestCase, TransactionTestCase

from gamedays.models import Team, Gameinfo, Gameresult, TeamLog
from gamedays.service.game_service import GameService
from gamedays.service.gamelog import GameLog
from gamedays.tests.setup_factories.db_setup import DBSetup


class TestGameService(TestCase):
    def test_game_not_available(self):
        with self.assertRaises(Gameinfo.DoesNotExist):
            GameService(1)

    def test_update_game_by_halftime(self):
        gameday = DBSetup().g62_status_empty()
        firstGame = Gameinfo.objects.first()
        game_service = GameService(firstGame.pk)
        game_service.update_halftime(gameday.author)
        firstGame = Gameinfo.objects.first()
        assert firstGame.status == "2. Halbzeit"
        assert re.match(
            "^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]", str(firstGame.gameHalftime)
        )
        assert len(TeamLog.objects.all()) == 1

    def test_gamestart_is_updated(self):
        gameday = DBSetup().g62_status_empty()
        firstGame = Gameinfo.objects.first()
        game_service = GameService(firstGame.pk)
        game_service.update_gamestart(gameday.author)
        firstGame: Gameinfo = Gameinfo.objects.first()
        assert firstGame.status == "1. Halbzeit"
        assert re.match(
            "^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]", str(firstGame.gameStarted)
        )
        assert len(TeamLog.objects.all()) == 1

    def test_gamefinished_is_updated(self):
        gameday = DBSetup().g62_status_empty()
        firstGame = Gameinfo.objects.first()
        game_service = GameService(firstGame.pk)
        game_service.update_game_finished(gameday.author)
        firstGame: Gameinfo = Gameinfo.objects.first()
        assert firstGame.status == "beendet"
        assert re.match(
            "^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]", str(firstGame.gameFinished)
        )
        assert len(TeamLog.objects.all()) == 1

    def test_entry_for_game_created_halftime_and_finished_only_written_once(self):
        gameday = DBSetup().g62_status_empty()
        firstGame = Gameinfo.objects.first()
        game_service = GameService(firstGame.pk)
        game_service.update_gamestart(gameday.author)
        game_service.update_gamestart(gameday.author)
        game_service.update_halftime(gameday.author)
        game_service.update_halftime(gameday.author)
        game_service.update_game_finished(gameday.author)
        game_service.update_game_finished(gameday.author)
        assert len(TeamLog.objects.all()) == 3

    def test_update_score(self):
        DBSetup().g62_status_empty()
        team_A1 = Team.objects.get(name="A1")
        team_A2 = Team.objects.get(name="A2")
        game = DBSetup().create_teamlog_home_and_away(home=team_A1, away=team_A2)
        gamelog = GameLog(game)
        game_service = GameService(game.pk)
        game_service.update_score(gamelog)
        assert Gameresult.objects.get(gameinfo=game, team=team_A1).fh == 21
        assert Gameresult.objects.get(gameinfo=game, team=team_A1).sh == 21
        assert Gameresult.objects.get(gameinfo=game, team=team_A1).pa == 3
        assert Gameresult.objects.get(gameinfo=game, team=team_A2).fh == 0
        assert Gameresult.objects.get(gameinfo=game, team=team_A2).sh == 3
        assert Gameresult.objects.get(gameinfo=game, team=team_A2).pa == 42

    def test_delete_entry(self):
        DBSetup().g62_status_empty()
        game = DBSetup().create_teamlog_home_and_away()
        game_service = GameService(game.pk)
        gamelog = game_service.delete_gamelog(2)
        assert gamelog.get_home_score() == 34
        assert gamelog.get_home_firsthalf_score() == 13

    def test_create_gamelog_resolves_team_by_id(self):
        gameday = DBSetup().g62_status_empty()
        team = Team.objects.get(name="A1")
        game = DBSetup().create_teamlog_home_and_away(home=team)
        event = [{"name": "Touchdown", "input": None, "player": "12"}]
        GameService(game.pk).create_gamelog(team.pk, event, gameday.author, 1)
        assert TeamLog.objects.filter(
            gameinfo=game, team=team, event="Touchdown"
        ).exists()

    def test_create_gamelog_resolves_team_by_name(self):
        gameday = DBSetup().g62_status_empty()
        team = Team.objects.get(name="A1")
        game = DBSetup().create_teamlog_home_and_away(home=team)
        event = [{"name": "Touchdown", "input": None, "player": "12"}]
        GameService(game.pk).create_gamelog(team.name, event, gameday.author, 1)
        assert TeamLog.objects.filter(
            gameinfo=game, team=team, event="Touchdown"
        ).exists()

    def test_create_gamelog_resolves_team_by_description(self):
        # The coin-toss "?start=" value carries Team.description (full club name),
        # while the write path historically only matched Team.name (short name).
        # The first scorecard entry per game must still resolve and return 201.
        gameday = DBSetup().g62_status_empty()
        team = Team.objects.get(name="A1")
        assert team.name != team.description
        game = DBSetup().create_teamlog_home_and_away(home=team)
        event = [{"name": "Touchdown", "input": None, "player": "12"}]
        GameService(game.pk).create_gamelog(team.description, event, gameday.author, 1)
        assert TeamLog.objects.filter(
            gameinfo=game, team=team, event="Touchdown"
        ).exists()

    def test_create_gamelog_raises_for_unknown_team(self):
        gameday = DBSetup().g62_status_empty()
        game = DBSetup().create_teamlog_home_and_away()
        event = [{"name": "Touchdown", "input": None, "player": "12"}]
        with self.assertRaises(Team.DoesNotExist):
            GameService(game.pk).create_gamelog(
                "no such team", event, gameday.author, 1
            )


TOUCHDOWN_WITH_PAT = [
    {"name": "Touchdown", "input": None, "player": "19"},
    {"name": "1-Extra-Punkt", "input": None, "player": "7"},
]


def _scores(game):
    home = Gameresult.objects.get(gameinfo=game, isHome=True)
    away = Gameresult.objects.get(gameinfo=game, isHome=False)
    return (home.fh, home.sh, home.pa), (away.fh, away.sh, away.pa)


class TestGamelogScoreChange(TestCase):
    """#1988: gamelog writes shift the stored score by their own effect only."""

    def setUp(self):
        self.gameday = DBSetup().g62_status_empty()
        self.game = Gameinfo.objects.first()
        self.home = Gameresult.objects.get(gameinfo=self.game, isHome=True).team
        # Manually entered score, no gamelog entries behind it.
        Gameresult.objects.filter(gameinfo=self.game, isHome=True).update(
            fh=14, sh=14, pa=14
        )
        Gameresult.objects.filter(gameinfo=self.game, isHome=False).update(
            fh=7, sh=7, pa=28
        )

    def test_add_then_delete_round_trips_with_fresh_services(self):
        GameService(self.game.pk).create_gamelog(
            self.home.pk, TOUCHDOWN_WITH_PAT, self.gameday.author, 1
        )
        assert _scores(self.game) == ((21, 14, 14), (7, 7, 35))

        GameService(self.game.pk).delete_gamelog(1)
        assert _scores(self.game) == ((14, 14, 14), (7, 7, 28))

    def test_add_then_delete_round_trips_on_one_service(self):
        game_service = GameService(self.game.pk)
        game_service.create_gamelog(
            self.home.pk, TOUCHDOWN_WITH_PAT, self.gameday.author, 2
        )
        game_service.delete_gamelog(1)
        game_service.delete_gamelog(1)
        assert _scores(self.game) == ((14, 14, 14), (7, 7, 28))

    def test_delete_below_zero_stores_zero_and_logs(self):
        GameService(self.game.pk).create_gamelog(
            self.home.pk, TOUCHDOWN_WITH_PAT, self.gameday.author, 1
        )
        Gameresult.objects.filter(gameinfo=self.game, isHome=True).update(fh=3)

        with self.assertLogs(
            "gamedays.service.wrapper.gameresult_wrapper", "WARNING"
        ) as logs:
            GameService(self.game.pk).delete_gamelog(1)

        assert _scores(self.game) == ((0, 14, 14), (7, 7, 14))
        assert "would drop to -4" in logs.output[0]


@unittest.skipUnless(
    connection.features.has_select_for_update, "needs row locks (MySQL in CI)"
)
class TestConcurrentGamelogWrites(TransactionTestCase):
    """Concurrent scorecard writes to one game must not lose points (#1988)."""

    WRITERS = 4

    def test_concurrent_creates_add_up(self):
        gameday = DBSetup().g62_status_empty()
        game = Gameinfo.objects.first()
        home = Gameresult.objects.get(gameinfo=game, isHome=True).team
        Gameresult.objects.filter(gameinfo=game).update(fh=0, sh=0, pa=0)
        half_scores = GameService._half_scores

        def slow_half_scores(gamelog):
            # Widen the window between reading the gamelog and writing scores.
            scores = half_scores(gamelog)
            time.sleep(0.2)
            return scores

        errors = []

        def write():
            try:
                GameService(game.pk).create_gamelog(
                    home.pk, TOUCHDOWN_WITH_PAT, gameday.author, 1
                )
            except Exception as error:  # pragma: no cover - reported below
                errors.append(error)
            finally:
                connection.close()

        with mock.patch.object(
            GameService, "_half_scores", staticmethod(slow_half_scores)
        ):
            threads = [threading.Thread(target=write) for _ in range(self.WRITERS)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        assert errors == []
        assert _scores(game) == ((7 * self.WRITERS, 0, 0), (0, 0, 7 * self.WRITERS))
