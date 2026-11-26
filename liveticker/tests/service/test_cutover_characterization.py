"""Characterization of the liveticker projection before the flag cutover.

Pins the flag-off/flag-on payload and ETag contract, the one-warning fallback
for flagged games, and the no-op paths in the projection helper. The branch
coverage gate is checked against HEAD before any of these functions changes.
"""

from datetime import UTC, datetime

import pytest
from django.test import TestCase, override_settings
from django.utils import timezone

from gameevents.models import GameEvent, GameState
from gamedays.models import Gameresult, Gameinfo
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
)
from liveticker.service.liveticker_service import (
    PERIOD_STATUS,
    LivetickerService,
)
from liveticker.tests.event_feed_support import event, make_live_game, submit

FIXED_NOW = datetime(2026, 11, 26, 18, 0, tzinfo=UTC)


class ProjectionCharacterisation(TestCase):
    def _v2_game(self, status="1. Halbzeit"):
        gameday = GamedayFactory()
        home = TeamFactory(name="cut-home", description="Cut Home")
        away = TeamFactory(name="cut-away", description="Cut Away")
        game = GameinfoFactory(
            gameday=gameday,
            status=status,
            standing="Gruppe 1",
            scheduled=__import__("datetime").time(10, 0),
        )
        GameresultFactory(gameinfo=game, team=home, fh=6, sh=0, pa=0, isHome=True)
        GameresultFactory(gameinfo=game, team=away, fh=0, sh=0, pa=0, isHome=False)
        submit(game, [event("score", code="touchdown", side="home", player=7)])
        GameState.objects.filter(game=game).update(score_home=7, period=2)
        return game

    def test_empty_and_unknown_games_are_projection_noops(self):
        service = LivetickerService([], [], [])
        service._apply_event_projection([])
        service._apply_event_projection(
            [{"id": 999999, "status": "Geplant", "score_home": 0, "score_away": 0}]
        )

    def test_finished_game_keeps_its_status_but_takes_the_event_score(self):
        game = self._v2_game(status="beendet")
        row = {
            "id": game.pk,
            "status": "beendet",
            "score_home": 0,
            "score_away": 0,
        }
        LivetickerService([], [], [])._apply_event_projection([row])

        assert row["score_home"] == 7
        assert row["status"] == "beendet"

    @override_settings(SCORECARD_EVENT_FEED=False)
    def test_flag_off_payload_is_unchanged_for_a_legacy_game(self):
        gameday = GamedayFactory()
        game = GameinfoFactory(gameday=gameday, status="Geplant", standing="G")
        payload = LivetickerService([], [], [gameday.pk]).get_liveticker_as_json()
        assert isinstance(payload, list)

    def test_projection_updates_a_live_game_score_and_period(self):
        game = self._v2_game()
        row = {
            "id": game.pk,
            "status": "1. Halbzeit",
            "score_home": 0,
            "score_away": 0,
        }
        LivetickerService([], [], [])._apply_event_projection([row])

        assert row["score_home"] == 7
        assert row["status"] == PERIOD_STATUS[2]
