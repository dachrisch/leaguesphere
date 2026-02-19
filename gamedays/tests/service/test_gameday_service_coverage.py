import pandas as pd
import pytest
from gamedays.models import Gameday, Gameinfo, Gameresult, Team
from gamedays.tests.setup_factories.factories import GamedayFactory
from gamedays.service.gameday_service import (
    EmptyOffenseStatisticTable,
    EmptyDefenseStatisticTable,
    EmptyGamedayService,
    EmptySplitScoreTable,
    EmptyEventsTable,
    EmptySchedule,
    EmptyQualifyTable,
    EmptyFinalTable,
    GamedayService,
    GamedayGameService,
)


class TestGamedayServiceCoverage:
    def test_empty_tables_to_json(self):
        assert EmptyOffenseStatisticTable.to_json() == "[]"
        assert EmptyDefenseStatisticTable.to_json() == "[]"
        assert EmptySplitScoreTable.to_json() == "[]"
        assert EmptyEventsTable.to_json() == "[]"

    @pytest.mark.django_db
    def test_empty_gameday_service_methods(self):
        assert EmptyGamedayService.get_games_to_whistle() == EmptySchedule
        assert EmptyGamedayService.get_schedule() == EmptySchedule
        assert EmptyGamedayService.get_qualify_table() == EmptyQualifyTable
        assert EmptyGamedayService.get_final_table() == EmptyFinalTable

        # Line 148-149: get_resolved_designer_data DoesNotExist
        assert EmptyGamedayService.get_resolved_designer_data(99999) == {
            "nodes": [],
            "edges": [],
        }

    @pytest.mark.django_db
    def test_resolve_team_edge_cases(self):
        gameday = GamedayFactory()
        official_team = Team.objects.create(
            name="Officials", description="Officials Team"
        )
        # Need at least one gameinfo for GamedayModelWrapper to not raise DoesNotExist
        Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            standing="DUMMY",
            status="Geplant",
            officials=official_team,
        )
        service = GamedayService(gameday.pk)

        # Line 255: invalid ref
        assert service.get_resolved_designer_data()["nodes"] == []

        # Setup for resolve_team
        team1 = Team.objects.create(name="Team 1", description="Team 1 Desc")
        team2 = Team.objects.create(name="Team 2", description="Team 2 Desc")
        game = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="11:00",
            field=1,
            standing="G1",
            status="Geplant",
            officials=official_team,
        )

        # Line 261: target game not completed
        data = {
            "nodes": [
                {
                    "type": "game",
                    "data": {"homeTeamDynamic": {"matchName": "G1", "type": "winner"}},
                }
            ]
        }
        gameday.designer_data = data
        gameday.save()
        resolved = service.get_resolved_designer_data()
        assert resolved["nodes"][0]["data"]["resolvedHomeTeam"] is None

        # Line 265: missing results
        game.status = Gameinfo.STATUS_COMPLETED
        game.save()
        resolved = service.get_resolved_designer_data()
        assert resolved["nodes"][0]["data"]["resolvedHomeTeam"] is None

        # Line 271: missing home/away (only one result)
        Gameresult.objects.create(gameinfo=game, team=team1, isHome=True)
        resolved = service.get_resolved_designer_data()
        assert resolved["nodes"][0]["data"]["resolvedHomeTeam"] is None

        # Line 280: Tie case
        Gameresult.objects.create(gameinfo=game, team=team2, isHome=False)
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=10, sh=0)
        Gameresult.objects.filter(gameinfo=game, isHome=False).update(fh=10, sh=0)
        game.status = Gameinfo.STATUS_COMPLETED
        game.save()
        resolved = service.get_resolved_designer_data()
        assert resolved["nodes"][0]["data"]["resolvedHomeTeam"] == "Tie"

        # Line 294: away_ref logic
        gameday.designer_data = {
            "nodes": [
                {
                    "type": "game",
                    "data": {"awayTeamDynamic": {"matchName": "G1", "type": "loser"}},
                }
            ]
        }
        gameday.save()
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=20, sh=0)
        Gameresult.objects.filter(gameinfo=game, isHome=False).update(fh=10, sh=0)
        game.status = Gameinfo.STATUS_COMPLETED
        game.save()
        resolved = service.get_resolved_designer_data()
        # Team 1 (home) wins, Team 2 (away) loses
        assert resolved["nodes"][0]["data"]["resolvedAwayTeam"] == "Team 2"

    def test_gameday_game_service_format_helpers(self):
        # Line 428: Extra point value 0
        row = pd.Series({"event": "1-Extra-Punkt", "value": 0})
        assert (
            GamedayGameService._format_event_with_player(row) == "<s>1-Extra-Punkt</s>"
        )

        # Line 450: format_time_string no colon
        assert GamedayGameService._format_time_string("1000") == "1000"
