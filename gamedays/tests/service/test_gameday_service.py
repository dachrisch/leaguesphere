from django.test import TestCase

from gamedays.models import Gameinfo, Team
from gamedays.service.gameday_service import (
    GamedayService,
    EmptySchedule,
    EmptyQualifyTable,
    EmptyFinalTable,
)
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import SeasonFactory, TeamLogFactory


class TestGamedayService(TestCase):

    def test_get_empty_gameday_to_html(self):
        gs = GamedayService.create(None)
        assert gs.get_schedule().to_html() == EmptySchedule().to_html()
        assert gs.get_qualify_table().to_html() == EmptyQualifyTable().to_html()
        assert gs.get_final_table().to_html() == EmptyFinalTable().to_html()

    def test_get_empty_gameday_to_json(self):
        gs = GamedayService.create(None)
        assert gs.get_schedule().to_json() == EmptySchedule().to_json()
        assert gs.get_qualify_table().to_json() == EmptyQualifyTable().to_json()
        assert gs.get_final_table().to_json() == EmptyFinalTable().to_json()

    def test_get_schedule_escapes_team_names(self):
        """Team names (Heim/Gast) flow unescaped into the schedule table
        via pandas.to_html(escape=False) then |safe; a malicious team name
        must render as text, not execute as HTML.
        """
        gameday = DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        home_result = first_game.gameresult_set.filter(isHome=True).first()
        home_result.team.description = "<script>alert(1)</script>"
        home_result.team.save()

        gs = GamedayService.create(gameday.pk)
        html = gs.get_schedule().to_html(escape=False)

        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html

    def test_get_schedule_escapes_officials_name_while_keeping_italic_markup(self):
        """The officials column is deliberately wrapped in <i> markup
        (gameday_service.py's get_schedule()); the officiating team's name
        must still be escaped before being wrapped, or a malicious team
        name breaks out of the <i> tag.
        """
        gameday = DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        malicious_officials_team = Team.objects.create(
            name="<script>alert(1)</script>",
            description="<script>alert(1)</script> desc",
            location="Nowhere",
        )
        first_game.officials = malicious_officials_team
        first_game.save()

        gs = GamedayService.create(gameday.pk)
        html = gs.get_schedule().to_html(escape=False)

        assert "<script>alert(1)</script>" not in html
        assert "<i>&lt;script&gt;alert(1)&lt;/script&gt;</i>" in html

    def test_get_offense_player_statistics_table_escapes_team_description(self):
        gameday = DBSetup().g62_finished(season=SeasonFactory(name="2025"))
        gameinfo = gameday.gameinfo_set.first()
        team_1_result, team_2_result = list(gameinfo.gameresult_set.all())
        team_1_result.team.description = "<script>alert(1)</script>"
        team_1_result.team.save()
        DBSetup().create_teamlog_home_and_away(
            team_1_result.team, team_2_result.team, gameinfo=gameinfo
        )

        gs = GamedayService.create(gameday.pk)
        html = gs.get_offense_player_statistics_table().to_html(escape=True)

        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html

    def test_get_defense_statistic_table_escapes_team_description(self):
        gameday = DBSetup().g62_finished(season=SeasonFactory(name="2025"))
        gameinfo = gameday.gameinfo_set.first()
        team_1_result, _ = list(gameinfo.gameresult_set.all())
        team_1_result.team.description = "<script>alert(1)</script>"
        team_1_result.team.save()
        TeamLogFactory(
            gameinfo=gameinfo,
            team=team_1_result.team,
            sequence=1,
            player=19,
            event="Interception",
            value=0,
            half=1,
            author=gameday.author,
        )

        gs = GamedayService.create(gameday.pk)
        html = gs.get_defense_player_statistic_table().to_html(escape=True)

        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html

    def test_get_games_to_whistle(self):
        gameday = DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        Gameinfo.objects.filter(id=first_game.pk).update(gameFinished="12:00")
        gs = GamedayService.create(gameday.pk)
        games_to_whistle = gs.get_games_to_whistle("officials")
        assert len(games_to_whistle) == 5

    def test_get_all_games_to_whistle_for_all_teams(self):
        gameday = DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        Gameinfo.objects.filter(id=first_game.pk).update(gameFinished="12:00")
        gs = GamedayService.create(gameday.pk)
        games_to_whistle = gs.get_games_to_whistle("*")
        assert len(games_to_whistle) == 10
