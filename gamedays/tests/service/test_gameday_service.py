from django.test import TestCase

from gamedays.models import Gameinfo, Team
from gamedays.service.gameday_service import (
    GamedayService,
    EmptySchedule,
    EmptyQualifyTable,
    EmptyFinalTable,
)
from gamedays.tests.setup_factories.db_setup import DBSetup


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
        """The schedule table reaches the template via |safe."""
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
        """The officials name is wrapped in <i> markup, so it must be escaped
        before wrapping or it breaks out of the tag.
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
