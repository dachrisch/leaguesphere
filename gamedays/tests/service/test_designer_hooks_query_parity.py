"""Slot/rule parity and query counts across the designer hook boundary (#2537)."""

from __future__ import annotations

from django.test import TestCase

from gameday_designer.models import ScheduleTemplate, TemplateSlot, TemplateUpdateRule
from gamedays.models import Gameday
from gamedays.service import designer_hooks
from gamedays.tests.setup_factories.db_setup import DBSetup


class DesignerHooksQueryParity(TestCase):
    def setUp(self):
        DBSetup().g62_status_empty()
        self.gameday = Gameday.objects.first()
        self.template = ScheduleTemplate.objects.create(
            name="Parity Template", num_teams=6, num_fields=2
        )
        self.slot = TemplateSlot.objects.create(
            template=self.template,
            field=1,
            slot_order=0,
            stage="Preliminary",
            standing="Gruppe 1",
        )
        self.rule = TemplateUpdateRule.objects.create(
            template=self.template,
            slot=self.slot,
            pre_finished="Gruppe 1",
        )

    def test_slots_hook_matches_direct_query_with_one_query(self):
        with self.assertNumQueries(1):
            direct = list(
                TemplateSlot.objects.filter(template=self.template).order_by(
                    "field", "slot_order"
                )
            )
        with self.assertNumQueries(1):
            hooked = designer_hooks.slots_for_template(self.template)
        assert [slot.pk for slot in hooked] == [slot.pk for slot in direct]

    def test_rules_hook_matches_direct_query_with_one_query(self):
        with self.assertNumQueries(1):
            direct = list(
                TemplateUpdateRule.objects.filter(
                    template=self.template, pre_finished="Gruppe 1"
                )
            )
        with self.assertNumQueries(1):
            hooked = designer_hooks.update_rules_for_template(
                self.template, pre_finished="Gruppe 1"
            )
        assert [rule.pk for rule in hooked] == [rule.pk for rule in direct]

    def test_update_rule_for_slot_matches_direct_query(self):
        with self.assertNumQueries(1):
            hooked = designer_hooks.update_rule_for_slot(self.slot)
        assert hooked.pk == self.rule.pk
