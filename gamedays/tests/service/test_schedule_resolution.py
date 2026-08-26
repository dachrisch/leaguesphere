from django.test import TestCase

from gameday_designer.models import (
    ScheduleTemplate,
    TemplateApplication,
    TemplateSlot,
    TemplateUpdateRule,
    TemplateUpdateRuleTeam,
)
from gamedays.models import Gameday, Gameresult
from gamedays.service.model_wrapper import GamedayModelWrapper
from gamedays.service.schedule_resolution_service import (
    GamedayScheduleResolutionService,
)
from gamedays.tests.setup_factories.db_setup import DBSetup


class TestScheduleResolution(TestCase):
    def setUp(self):
        self.db_setup = DBSetup()
        self.db_setup.g62_finished()
        self.gameday = Gameday.objects.first()

        self.template = ScheduleTemplate.objects.create(
            name="Test Template", num_teams=6, num_fields=2
        )
        TemplateApplication.objects.create(
            gameday=self.gameday, template=self.template, team_mapping={}
        )

    def _resolve_service(self):
        return GamedayScheduleResolutionService(self.gameday.pk)

    def _get_home_result(self, standing):
        from gamedays.models import Gameinfo, Gameresult

        game = Gameinfo.objects.get(
            gameday=self.gameday, field=1, stage="Finalrunde", standing=standing
        )
        return game, Gameresult.objects.get(gameinfo=game, isHome=True)

    def test_updates_participants_from_finished_group_standings(self):
        slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=1,
            stage="Finalrunde",
            standing="P1",
            home_reference="Winner Gruppe 1",
            away_reference="Winner Gruppe 2",
        )
        rule = TemplateUpdateRule.objects.create(
            template=self.template, slot=slot, pre_finished="Gruppe 1"
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=rule, role="home", standing="Gruppe 1", place=1
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=rule, role="away", standing="Gruppe 2", place=1
        )

        gmw = GamedayModelWrapper(self.gameday.pk)
        expected_home = gmw.get_team_by(place=1, standing="Gruppe 1")
        expected_away = gmw.get_team_by(place=1, standing="Gruppe 2")

        self._resolve_service().update_participants("Gruppe 1")

        game, home_result = self._get_home_result("P1")
        away_result = home_result.gameinfo.gameresult_set.get(isHome=False)
        assert away_result is not None
        assert home_result.team.description == expected_home
        assert away_result.team.description == expected_away

    def test_no_template_returns_without_error(self):
        TemplateApplication.objects.all().delete()

        # Should not raise and should not have modified the target game
        self._resolve_service().update_participants("Gruppe 1")

        game, home_result = self._get_home_result("P1")
        assert home_result.team is not None

    def test_unknown_finished_standing_is_ignored(self):
        slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=1,
            stage="Finalrunde",
            standing="P3",
            home_reference="Loser Gruppe 1",
        )
        TemplateUpdateRule.objects.create(
            template=self.template, slot=slot, pre_finished="Gruppe Zufall"
        )

        self._resolve_service().update_participants("Nicht Vorhanden")

        game, home_result = self._get_home_result("P3")
        assert home_result.team is not None

    def test_official_role_sets_game_officials(self):
        slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=1,
            stage="Finalrunde",
            standing="P1",
            home_reference="x",
            away_reference="y",
        )
        rule = TemplateUpdateRule.objects.create(
            template=self.template, slot=slot, pre_finished="Gruppe 1"
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=rule, role="official", standing="Gruppe 2", place=1
        )

        gmw = GamedayModelWrapper(self.gameday.pk)
        expected_official = gmw.get_team_by(place=1, standing="Gruppe 2")

        self._resolve_service().update_participants("Gruppe 1")

        from gamedays.models import Gameinfo

        p1_game = Gameinfo.objects.get(
            gameday=self.gameday, field=1, stage="Finalrunde", standing="P1"
        )
        assert p1_game.officials.description == expected_official

    def test_ambiguous_target_game_is_skipped(self):
        # Two HF games on field 1 ("Finalrunde"/"HF") => ambiguous match
        slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=1,
            stage="Finalrunde",
            standing="HF",
            home_reference="x",
            away_reference="y",
        )
        rule = TemplateUpdateRule.objects.create(
            template=self.template, slot=slot, pre_finished="Gruppe 1"
        )
        TemplateUpdateRuleTeam.objects.create(
            update_rule=rule, role="home", standing="Gruppe 1", place=1
        )

        # Sanity: there are two HF games in the DBSetup g62_finished fixture
        from gamedays.models import Gameinfo

        assert (
            Gameinfo.objects.filter(
                gameday=self.gameday, field=1, stage="Finalrunde", standing="HF"
            ).count()
            == 2
        )

        gmw = GamedayModelWrapper(self.gameday.pk)
        expected_home = gmw.get_team_by(place=1, standing="Gruppe 1")

        self._resolve_service().update_participants("Gruppe 1")

        # Ambiguous match must be skipped: HF games keep their original teams
        for hf in Gameinfo.objects.filter(
            gameday=self.gameday, field=1, stage="Finalrunde", standing="HF"
        ):
            home = Gameresult.objects.get(gameinfo=hf, isHome=True)
            assert home.team.description != expected_home
