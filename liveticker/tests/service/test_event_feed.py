"""The liveticker event projection (T5, now the permanent read path).

Flag off, the response is byte-for-byte today's (the characterisation test
hard-codes the payload). Flag on, an event-sourced game takes its score and
period from ``GameState`` while the ticks stay the projected ``TeamLog`` rows
the widget already reads; a flagged projection falls back to those rows so the
public widget never shows a 409 or a blank game.
"""

import copy
import json
from datetime import UTC, datetime, time
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from gameevents.models import GameEvent, GameState
from gamedays.models import Gameresult, Gameinfo, TeamLog
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
    def test_flag_off_payload_is_byte_identical(self, _now):
        game = self._legacy_fixture()

        expected = [
            {
                "gameId": game.pk,
                "status": "1. Halbzeit",
                "standing": "Gruppe 1",
                "stage": "",
                "field": 1,
                "league": "some_division",
                "gameday": {
                    "id": game.gameday_id,
                    "name": "Test Spieltag",
                    "address": "",
                },
                "time": "2026-10-28T10:00:00+00:00",
                "scheduled_at": timezone.make_aware(
                    datetime.combine(game.gameday.date, time(10, 0))
                ).isoformat(),
                "tick_count": 9,
                "home": {
                    "name": "char-home",
                    "full_name": "Char Home",
                    "score": 12,
                    "isInPossession": True,
                    "logo": None,
                    "fh": 6,
                    "sh": 6,
                },
                "away": {
                    "name": "char-away",
                    "full_name": "Char Away",
                    "score": 6,
                    "isInPossession": False,
                    "logo": None,
                    "fh": 3,
                    "sh": 3,
                },
                "ticks": [
                    {
                        "text": "Touchdown",
                        "type": "touchdown",
                        "team": "away",
                        "time": "2026-10-28T10:09:00+00:00",
                    },
                    {
                        "text": "Interception",
                        "type": "interception",
                        "team": "away",
                        "time": "2026-10-28T10:08:00+00:00",
                    },
                    {
                        "text": "Spielzeit - 12:00",
                        "type": "clock",
                        "team": None,
                        "time": "2026-10-28T10:07:00+00:00",
                    },
                    {
                        "text": "Safety (+1): #7",
                        "type": "safety",
                        "team": "away",
                        "time": "2026-10-28T10:06:00+00:00",
                    },
                    {
                        "text": "Auszeit - 12:00",
                        "type": "timeout",
                        "team": "home",
                        "time": "2026-10-28T10:05:00+00:00",
                    },
                ],
            }
        ]

        assert json.dumps(payload_for(game.gameday_id)) == json.dumps(expected)


class EventProjectionTest(TestCase):
    """Flag on: score/period from ``GameState``, ticks from projected rows."""

    def _row_derived_twin(self, game):
        """A second game in the same gameday that owns the same rows, no events.

        Copying the rows the events wrote gives the expected payload a
        *row-derived* source: it is not hard-coded and it is not produced by
        the projection being asserted.
        """

        home_result = Gameresult.objects.get(gameinfo=game, isHome=True)
        away_result = Gameresult.objects.get(gameinfo=game, isHome=False)
        home = home_result.team
        away = away_result.team
        twin = GameinfoFactory(
            gameday=game.gameday,
            status=game.status,
            standing=game.standing,
            field=game.field,
            scheduled=game.scheduled,
            gameStarted=game.gameStarted,
            in_possession=game.in_possession,
        )
        GameresultFactory(
            gameinfo=twin,
            team=home,
            isHome=True,
            fh=home_result.fh,
            sh=home_result.sh,
            pa=home_result.pa,
        )
        GameresultFactory(
            gameinfo=twin,
            team=away,
            isHome=False,
            fh=away_result.fh,
            sh=away_result.sh,
            pa=away_result.pa,
        )
        for row in TeamLog.objects.filter(gameinfo=game).order_by("pk"):
            TeamLogFactory(
                gameinfo=twin,
                created_time=row.created_time,
                event=row.event,
                team=row.team,
                player=row.player,
                input=row.input,
                value=row.value,
                half=row.half,
                sequence=row.sequence,
                cop=row.cop,
                author=row.author,
                isDeleted=row.isDeleted,
            )
        return twin

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

        projected = payload_for(game.gameday_id)
        assert len(projected[0]["ticks"]) == 5

        twin = self._row_derived_twin(game)
        both = {item["gameId"]: item for item in payload_for(game.gameday_id)}
        expected = copy.deepcopy(both[twin.pk])
        expected["gameId"] = game.pk
        # Byte-for-byte parity against the row-derived payload: same totals,
        # period, standing, and five ticks in the same order with the same
        # text and timestamps. The only difference is the id of the twin.
        assert json.dumps(projected[0]) == json.dumps(expected)

        # The permanent event path produces the same totals, period and five
        # ticks in the same order with the same text and timestamps.
        assert projected[0]["home"]["score"] == 7
        assert projected[0]["away"]["score"] == 6
        assert projected[0]["status"] == "1. Halbzeit"

        home_result = Gameresult.objects.get(gameinfo=game, isHome=True)
        away_result = Gameresult.objects.get(gameinfo=game, isHome=False)
        assert home_result.fh + home_result.sh == projected[0]["home"]["score"]
        assert away_result.fh + away_result.sh == projected[0]["away"]["score"]

    def test_period_comes_from_the_projection_not_the_gameinfo_status(self):
        game, _home, _away = make_live_game("period")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        submit(
            game,
            [event("period", "half_time", None, period=2)],
            client_id="s2",
        )
        # The projection is the truth. A status row that still says first half
        # (written before the append mirrored the half, or by an older deploy)
        # must not drag the feed back.
        Gameinfo.objects.filter(pk=game.pk).update(status="1. Halbzeit")
        game.refresh_from_db()
        assert game.status == "1. Halbzeit"

        payload = payload_for(game.gameday_id)

        assert payload[0]["status"] == "2. Halbzeit"
        assert payload[0]["home"]["score"] == 6

    def test_projected_score_wins_over_a_stale_result_table(self):
        game, _home, _away = make_live_game("score-source")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        # Only the projection moves; the row-based query would now say 0:0.
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=0, sh=0)

        payload = payload_for(game.gameday_id)

        assert payload[0]["home"]["score"] == 6

    def test_a_shadow_only_game_is_served_from_the_rows(self):
        """Ownership is a ``source=v2`` event; shadow events stay audit-only.

        The audit event an earlier deploy's shadow left is built through the
        canonical service and relabelled ``legacy`` (v1 writes no longer
        create events). Its projection and the rows then disagree on purpose:
        the liveticker must read the rows, exactly like a pure legacy game.
        """

        game, _home, _away = make_live_game("shadow-only")
        submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
        GameEvent.objects.filter(game=game).update(source=GameEvent.Source.LEGACY)
        # Only the rows' result table moves; a projection read would say 6.
        Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=0, sh=0)

        payload = payload_for(game.gameday_id)

        assert payload[0]["home"]["score"] == 0
        assert payload[0]["ticks"][0]["text"] == "Touchdown: #7"

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
