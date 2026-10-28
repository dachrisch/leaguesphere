"""The liveticker behind ``SCORECARD_EVENT_FEED`` (T5).

Flag off, the response is byte-for-byte today's (the characterisation test
hard-codes the payload). Flag on, an event-sourced game takes its score and
period from ``GameState`` while the ticks stay the projected ``TeamLog`` rows
the widget already reads; a flagged projection falls back to those rows so the
public widget never shows a 409 or a blank game.
"""

import json
from datetime import UTC, datetime, time
from unittest.mock import patch

from django.test import TestCase, override_settings

from gameevents.models import GameState
from gamedays.models import Gameresult
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameresultFactory,
    GameinfoFactory,
    TeamLogFactory,
    TeamFactory,
)
from liveticker.service.liveticker_service import LivetickerService
from liveticker.tests.event_feed_support import event, make_live_game, submit

FIXED_NOW = datetime(2026, 10, 28, 18, 0, tzinfo=UTC)


def payload_for(gameday_id):
    return LivetickerService([], [], [gameday_id]).get_liveticker_as_json()


class CharacterisationTest(TestCase):
    """Flag off = today's query, byte for byte."""

    def _legacy_fixture(self):
        gameday = GamedayFactory()
        home = TeamFactory(name="char-home", description="Char Home")
        away = TeamFactory(name="char-away", description="Char Away")
        game = GameinfoFactory(
            gameday=gameday,
            status="1. Halbzeit",
            standing="Gruppe 1",
            scheduled=time(10, 0),
            gameStarted=time(10, 0),
            in_possession=home.name,
        )
        GameresultFactory(gameinfo=game, team=home, fh=6, sh=6, pa=0, isHome=True)
        GameresultFactory(gameinfo=game, team=away, fh=3, sh=3, pa=0, isHome=False)
        author = gameday.author
        rows = [
            # created_time, event, team, player, input, value, half, sequence, cop
            (time(10, 1), "Spiel gestartet", None, None, "", 0, 0, 0, False),
            (time(10, 2), "Touchdown", home, 19, "", 6, 1, 1, False),
            (time(10, 3), "1-Extra-Punkt", home, 7, "", 1, 1, 1, False),
            (time(10, 4), "Strafe", away, None, "Holding", 0, 1, 0, False),
            (time(10, 5), "Auszeit", home, None, "12:00", 0, 1, 0, False),
            (time(10, 6), "Safety (+1)", away, 7, "", 1, 2, 4, False),
            (time(10, 7), "Spielzeit", home, None, "12:00", 0, 1, 0, False),
            (time(10, 8), "Interception", away, None, "", 0, 2, 6, True),
            (time(10, 9), "Touchdown", away, None, "", 0, 2, 7, False),
        ]
        for (
            created_time,
            name,
            team,
            player,
            input_value,
            value,
            half,
            sequence,
            cop,
        ) in rows:
            TeamLogFactory(
                gameinfo=game,
                created_time=created_time,
                event=name,
                team=team,
                player=player,
                input=input_value,
                value=value,
                half=half,
                sequence=sequence,
                cop=cop,
                author=author,
            )
        return game

    @patch("django.utils.timezone.now", return_value=FIXED_NOW)
    @override_settings(SCORECARD_EVENT_FEED=False)
    def test_flag_off_payload_is_byte_identical(self, _now):
        game = self._legacy_fixture()

        expected = [
            {
                "gameId": game.pk,
                "status": "1. Halbzeit",
                "standing": "Gruppe 1",
                "time": "2026-10-28T10:00:00+00:00",
                "home": {
                    "name": "Char Home",
                    "score": 12,
                    "isInPossession": True,
                },
                "away": {
                    "name": "Char Away",
                    "score": 6,
                    "isInPossession": False,
                },
                "ticks": [
                    {
                        "text": "Touchdown",
                        "team": "away",
                        "time": "2026-10-28T10:09:00+00:00",
                    },
                    {
                        "text": "Interception",
                        "team": "away",
                        "time": "2026-10-28T10:08:00+00:00",
                    },
                    {
                        "text": "Spielzeit - 12:00",
                        "team": None,
                        "time": "2026-10-28T10:07:00+00:00",
                    },
                    {
                        "text": "Safety (+1): #7",
                        "team": "away",
                        "time": "2026-10-28T10:06:00+00:00",
                    },
                    {
                        "text": "Auszeit - 12:00",
                        "team": "home",
                        "time": "2026-10-28T10:05:00+00:00",
                    },
                ],
            }
        ]

        assert json.dumps(payload_for(game.gameday_id)) == json.dumps(expected)

    @override_settings(SCORECARD_EVENT_FEED=False)
    def test_flag_off_ignores_the_projection_even_when_events_exist(self):
        game, _home, _away = make_live_game("off-projection")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=0, sh=0)

        payload = payload_for(game.gameday_id)

        assert payload[0]["home"]["score"] == 0
        # And the row-based ticks are still the only source.
        assert payload[0]["ticks"][0]["text"] == "Touchdown: #7"


class EventProjectionTest(TestCase):
    """Flag on: score/period from ``GameState``, ticks from projected rows."""

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_same_game_scores_period_and_last_five_ticks_match_the_row_path(self):
        game, _home, _away = make_live_game("parity")
        submit(
            game,
            [
                event("score", "touchdown", "home", 7),
                event("score", "pat1", "home", 7),
                event("score", "touchdown", "away", 9),
                event("penalty", "Holding", "away", 3),
                event("timeout", "home", payload={"input": "12:00"}),
                event("time", "clock", "home", payload={"input": "07:30"}),
            ],
            client_id="s1",
        )

        assert len(payload_for(game.gameday_id)[0]["ticks"]) == 5
        with override_settings(SCORECARD_EVENT_FEED=False):
            row_based = payload_for(game.gameday_id)
        with override_settings(SCORECARD_EVENT_FEED=True):
            projected = payload_for(game.gameday_id)

        # Byte-identical: same totals, same period, same five ticks in the
        # same order with the same text and timestamps.
        assert json.dumps(projected) == json.dumps(row_based)
        assert projected[0]["home"]["score"] == 7
        assert projected[0]["away"]["score"] == 6
        assert projected[0]["status"] == "1. Halbzeit"

        home_result = Gameresult.objects.get(gameinfo=game, isHome=True)
        away_result = Gameresult.objects.get(gameinfo=game, isHome=False)
        assert home_result.fh + home_result.sh == projected[0]["home"]["score"]
        assert away_result.fh + away_result.sh == projected[0]["away"]["score"]

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_period_comes_from_the_projection_not_the_gameinfo_status(self):
        game, _home, _away = make_live_game("period")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        submit(
            game,
            [event("period", "half_time", None, period=2)],
            client_id="s2",
        )
        # The scorer's half marker changed the projection; Gameinfo still says
        # first half, and the game is still selected by its status.
        game.refresh_from_db()
        assert game.status == "1. Halbzeit"

        with override_settings(SCORECARD_EVENT_FEED=False):
            assert payload_for(game.gameday_id)[0]["status"] == "1. Halbzeit"
        with override_settings(SCORECARD_EVENT_FEED=True):
            payload = payload_for(game.gameday_id)

        assert payload[0]["status"] == "2. Halbzeit"
        assert payload[0]["home"]["score"] == 6

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_projected_score_wins_over_a_stale_result_table(self):
        game, _home, _away = make_live_game("score-source")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        # Only the projection moves; the row-based query would now say 0:0.
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=0, sh=0)

        payload = payload_for(game.gameday_id)

        assert payload[0]["home"]["score"] == 6

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_a_flagged_projection_falls_back_to_the_rows_and_warns_once(self):
        first, _home, _away = make_live_game("flagged-one")
        submit(first, [event("score", "touchdown", "home", 7)], client_id="s1")
        second, _home, _away = make_live_game(
            "flagged-two", gameday=first.gameday, scheduled=time(11, 10)
        )
        submit(second, [event("score", "touchdown", "away", 9)], client_id="s2")

        GameState.objects.filter(game=first).update(
            needs_reconciliation=True,
            reconciliation_note="undo of sequence 4 has no stored event",
            score_home=99,
            score_away=98,
        )
        GameState.objects.filter(game=second).update(
            needs_reconciliation=True,
            reconciliation_note="undo of sequence 4 has no stored event",
            score_home=97,
            score_away=96,
        )

        with self.assertLogs(
            "liveticker.service.liveticker_service", level="WARNING"
        ) as logs:
            payload = payload_for(first.gameday_id)

        scores = {game["gameId"]: game for game in payload}
        assert scores[first.pk]["home"]["score"] == 6
        assert scores[first.pk]["away"]["score"] == 0
        assert scores[second.pk]["home"]["score"] == 0
        assert scores[second.pk]["away"]["score"] == 6
        # One warning for the request, naming both games -- not one per game.
        assert len(logs.output) == 1
        assert str(first.pk) in logs.output[0]
        assert str(second.pk) in logs.output[0]

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_a_mixed_gameday_renders_the_event_sourced_and_the_legacy_game(self):
        gameday = GamedayFactory()
        projected, _home, _away = make_live_game("mixed-projected", gameday=gameday)
        legacy, legacy_home, _away = make_live_game(
            "mixed-legacy", gameday=gameday, scheduled=time(11, 10)
        )
        submit(projected, [event("score", "touchdown", "home", 7)], client_id="s1")
        # Divergence only the projection knows about.
        Gameresult.objects.filter(gameinfo=projected, isHome=True).update(fh=0, sh=0)
        TeamLogFactory(
            gameinfo=legacy,
            team=legacy_home,
            sequence=1,
            player=3,
            event="Touchdown",
            value=6,
            half=1,
            author=gameday.author,
        )
        Gameresult.objects.filter(gameinfo=legacy, isHome=True).update(fh=6, sh=0)

        payload = {game["gameId"]: game for game in payload_for(gameday.pk)}

        assert payload[projected.pk]["home"]["score"] == 6
        assert payload[projected.pk]["ticks"][0]["text"] == "Touchdown: #7"
        assert payload[legacy.pk]["home"]["score"] == 6
        assert payload[legacy.pk]["ticks"][0]["text"] == "Touchdown: #3"
