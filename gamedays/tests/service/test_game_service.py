import re

from django.test import TestCase

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
