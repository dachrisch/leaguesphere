"""Fallback branches of the placeholder service across the hook boundary (#2537)."""

from __future__ import annotations

from django.test import TestCase

from gamedays.models import Gameday
from gamedays.service.placeholder_service import GamedayPlaceholderService
from gamedays.tests.setup_factories.db_setup import DBSetup


class PlaceholderHookFallbacks(TestCase):
    def setUp(self):
        DBSetup().g62_status_empty()

    def test_missing_gameday_has_no_template(self):
        service = GamedayPlaceholderService(999999)
        assert service.get_template() is None

    def test_no_template_gives_empty_slots(self):
        gameday = Gameday.objects.first()
        service = GamedayPlaceholderService(gameday.pk)
        assert service._get_slots_by_field() == {}
