"""Characterization of the permanent liveticker projection (after the cutover).

Pins the row-based legacy payload, the event-sourced payload, the one-warning
fallback for flagged games, and both no-op paths of the projection helper.
There is no flag any more, so the old flag-off/flag-on names are gone.
"""

from datetime import UTC, datetime, time as time_value

from django.test import TestCase
from django.utils import timezone

from gameevents.models import GameState
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
from liveticker.tests.event_feed_support import event, submit

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
            scheduled=time_value(10, 0),
        )
        GameresultFactory(gameinfo=game, team=home, fh=6, sh=0, pa=0, isHome=True)
        GameresultFactory(gameinfo=game, team=away, fh=0, sh=0, pa=0, isHome=False)
        submit(game, [event("score", code="touchdown", side="home", player=7)])
        GameState.objects.filter(game=game).update(score_home=7, period=2)
        return game

    def test_empty_and_unknown_games_are_projection_noops(self):
        empty = []
        unknown = {
            "id": 999999,
            "status": "Geplant",
            "score_home": 0,
            "score_away": 0,
        }
        service = LivetickerService([], [], [])

        service._apply_event_projection(empty)
        service._apply_event_projection([unknown])

        assert empty == []
        assert unknown == {
            "id": 999999,
            "status": "Geplant",
            "score_home": 0,
            "score_away": 0,
        }

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

    def test_legacy_game_keeps_the_row_based_payload(self):
        gameday = GamedayFactory()
        home = TeamFactory(name="cut-legacy-home", description="Cut Legacy Home")
        away = TeamFactory(name="cut-legacy-away", description="Cut Legacy Away")
        game = GameinfoFactory(
            gameday=gameday,
            status="1. Halbzeit",
            standing="Gruppe 1",
            scheduled=time_value(10, 0),
        )
        GameresultFactory(gameinfo=game, team=home, fh=6, sh=0, pa=0, isHome=True)
        GameresultFactory(gameinfo=game, team=away, fh=0, sh=0, pa=0, isHome=False)
        self._add_row(game, home, "Touchdown", 7, 6, 1, 1)
        self._add_row(game, away, "Touchdown", 9, 6, 1, 2)

        payload = LivetickerService([], [], [gameday.pk]).get_liveticker_as_json()

        assert len(payload) == 1
        assert payload[0]["gameId"] == game.pk
        assert payload[0]["home"]["score"] == 6
        assert payload[0]["away"]["score"] == 0
        assert payload[0]["status"] == "1. Halbzeit"
        assert [tick["text"] for tick in payload[0]["ticks"]] == [
            "Touchdown: #9",
            "Touchdown: #7",
        ]
        assert not GameState.objects.filter(game=game).exists()

    @staticmethod
    def _add_row(game, team, name, player, value, half, sequence):
        from gamedays.tests.setup_factories.factories import TeamLogFactory

        return TeamLogFactory(
            gameinfo=game,
            team=team,
            event=name,
            player=player,
            value=value,
            half=half,
            sequence=sequence,
            author=game.gameday.author,
        )

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
