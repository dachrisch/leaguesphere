"""Characterization of the pre-registry schedule resolution (Phase 1, #2537).

These tests pin the behaviour that the ordered registry must preserve:
designer template > canvas > legacy, the failure path that still lets
finalisation succeed, and the query cost of slot/rule resolution.
"""

from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase

from gameday_designer.models import ScheduleTemplate, TemplateApplication
from gamedays.management.schedule_update import ScheduleUpdate
from gamedays.models import Gameday, GamedayDesignerState, Gameinfo
from gamedays.service.placeholder_service import GamedayPlaceholderService
from gamedays.service.schedule_resolution_service import (
    GamedayScheduleResolutionService,
)
from gamedays.tests.setup_factories.db_setup import DBSetup


class ScheduleStrategyCharacterization(TestCase):
    def setUp(self):
        DBSetup().g62_status_empty()
        self.gameday = Gameday.objects.first()
        self.game = Gameinfo.objects.filter(gameday=self.gameday).first()

    def _finish(self):
        self.game.status = Gameinfo.STATUS_COMPLETED
        self.game.save()

    @patch.object(ScheduleUpdate, "update")
    @patch("gamedays.service.model_wrapper.GamedayModelWrapper.is_finished")
    @patch.object(GamedayScheduleResolutionService, "update_participants")
    def test_designer_template_wins_over_canvas_and_legacy(
        self, participants, is_finished, legacy
    ):
        template = ScheduleTemplate.objects.create(
            name="Test Template", num_teams=6, num_fields=2
        )
        TemplateApplication.objects.create(
            gameday=self.gameday, template=template, team_mapping={}
        )
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data={})
        is_finished.return_value = True

        self._finish()

        assert participants.call_count == 2
        legacy.assert_not_called()

    @patch.object(ScheduleUpdate, "update")
    @patch(
        "gameday_designer.service.canvas_progression_service.CanvasBracketProgressionService.apply"
    )
    def test_canvas_wins_over_legacy_without_template(self, canvas_apply, legacy):
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data={})

        self._finish()

        canvas_apply.assert_called_once()
        legacy.assert_not_called()

    @patch.object(ScheduleUpdate, "update")
    @patch(
        "gameday_designer.service.canvas_progression_service.CanvasBracketProgressionService.apply"
    )
    def test_legacy_is_the_last_fallback(self, canvas_apply, legacy):
        self._finish()
        legacy.assert_called_once()
        canvas_apply.assert_not_called()

    @patch.object(ScheduleUpdate, "update")
    def test_non_finished_game_does_not_resolve(self, legacy):
        self.game.save()
        legacy.assert_not_called()

    @patch.object(ScheduleUpdate, "update", side_effect=RuntimeError("boom"))
    def test_resolution_failure_does_not_abort_finalisation(self, legacy):
        # The signal swallows failures: saving a completed game succeeds.
        self._finish()
        assert legacy.call_count == 1

    def test_slot_and_rule_resolution_query_count_is_flat(self):
        template = ScheduleTemplate.objects.create(
            name="Test Template", num_teams=6, num_fields=2
        )
        TemplateApplication.objects.create(
            gameday=self.gameday, template=template, team_mapping={}
        )
        service = GamedayPlaceholderService(self.gameday.pk)

        with self.assertNumQueries(3):
            first = service.get_template()
            slots = service._get_slots_by_field()

        assert first.pk == template.pk
        assert isinstance(slots, dict)
