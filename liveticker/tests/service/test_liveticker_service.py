from datetime import date, datetime, time
from datetime import timezone as dt_timezone
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from gamedays.models import League, Gameinfo, Gameresult
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamLogFactory
from liveticker.service.liveticker_service import (
    LivetickerService,
    resolve_gameday_ids,
)
from liveticker.tests.event_feed_support import make_live_game


class TestLivetickerService(TestCase):
    def test_no_liveticker_available(self):
        DBSetup().create_empty_gameday()
        ls = LivetickerService([], [], [])
        assert ls.get_liveticker_as_json() == []

    def test_get_livetickers_for_league(self):
        gameday = DBSetup().g62_status_empty()
        league = League(name="specific-league")
        league.save()
        gameday.league = league
        gameday.save()
        ls = LivetickerService(["specific-league"], [], [])
        all_livetickers = ls.get_liveticker_as_json()
        assert len(all_livetickers) == 2

        ls = LivetickerService(["not-available-league"], [], [])
        all_livetickers = ls.get_liveticker_as_json()
        assert all_livetickers == []

    def test_get_all_livetickers_with_games_already_playing(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        Gameinfo.objects.filter(pk=first_game.pk + 1).update(status="1. Halbzeit")
        Gameinfo.objects.filter(pk=first_game.pk + 2).update(status="2. Halbzeit")
        ls = LivetickerService([], [], [])
        all_livetickers = ls.get_liveticker_as_json()
        assert len(all_livetickers) == 4

    def test_get_all_livetickers_for_specific_gameday(self):
        gameday = DBSetup().g62_status_empty()
        DBSetup().g62_status_empty()
        ls = LivetickerService([], [], [])
        all_livetickers = ls.get_liveticker_as_json()
        assert len(all_livetickers) == 4
        ls = LivetickerService([], [], [gameday.pk])
        specific_liveticker = ls.get_liveticker_as_json()
        assert len(specific_liveticker) == 2

    def test_get_livetickers_for_last_done_and_coming_up_games(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        # set first game of group 1
        Gameinfo.objects.filter(pk=first_game.pk).update(
            gameStarted="10:00", gameFinished="10:59", status="beendet"
        )
        # set first game of group 2
        Gameinfo.objects.filter(pk=first_game.pk + 3).update(
            gameStarted="10:00", gameFinished="10:59", status="beendet"
        )
        ls = LivetickerService([], [], [])
        all_livetickers = ls.get_liveticker_as_json()
        assert len(all_livetickers) == 4
        assert dict(all_livetickers[0])["status"] == "Geplant"
        assert dict(all_livetickers[2])["status"] == "beendet"

    def test_liveticker_init_correct(self):
        gameday = DBSetup().g62_status_empty()
        liveticker_service = LivetickerService([], [], [])
        all_liveticker = liveticker_service.get_liveticker_as_json()
        first_game = Gameinfo.objects.first()
        assert dict(all_liveticker[0]) == {
            "away": {
                "isInPossession": False,
                "name": "A2",
                "full_name": "AAAAAAA2",
                "score": 2,
                "logo": None,
                "fh": 1,
                "sh": 1,
            },
            "home": {
                "isInPossession": True,
                "name": "A1",
                "full_name": "AAAAAAA1",
                "score": 3,
                "logo": None,
                "fh": 2,
                "sh": 1,
            },
            "gameId": first_game.pk,
            "standing": "Gruppe 1",
            "stage": "Vorrunde",
            "field": 1,
            "league": "some_division",
            "gameday": {
                "id": gameday.pk,
                "name": "Test Spieltag",
                "address": "",
            },
            "status": "Geplant",
            "ticks": [],
            "time": "10:00",
            "scheduled_at": timezone.make_aware(
                datetime.combine(gameday.date, time(10, 0))
            ).isoformat(),
            "tick_count": 0,
        }

    def test_liveticker_get_default_5_ticks(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        home = Gameresult.objects.get(gameinfo=first_game, isHome=True)
        away = Gameresult.objects.get(gameinfo=first_game, isHome=False)
        DBSetup().create_teamlog_home_and_away(
            home=home.team, away=away.team, gameinfo=first_game
        )
        liveticker_service = LivetickerService([], [], [])
        all_livetickers = liveticker_service.get_liveticker_as_json()
        assert len(all_livetickers[0]["ticks"]) == 5

    def test_liveticker_get_all_ticks(self):
        DBSetup().g62_status_empty()
        first_game = Gameinfo.objects.first()
        home = Gameresult.objects.get(gameinfo=first_game, isHome=True)
        away = Gameresult.objects.get(gameinfo=first_game, isHome=False)
        DBSetup().create_teamlog_home_and_away(
            home=home.team, away=away.team, gameinfo=first_game
        )
        liveticker_service = LivetickerService([], [first_game.pk], [])
        all_livetickers = liveticker_service.get_liveticker_as_json()
        assert len(all_livetickers[0]["ticks"]) == 19


class TestTickTypeQueryBudget(TestCase):
    def test_type_is_read_without_an_extra_query(self):
        gameday = GamedayFactory()
        game, home, _ = make_live_game("type-budget", gameday=gameday)
        TeamLogFactory(
            gameinfo=game,
            team=home,
            author=gameday.author,
            event="Touchdown",
            created_time=time(10, 0),
            half=1,
            sequence=1,
        )
        service = LivetickerService([], [], [gameday.pk])
        payload = [{"id": game.pk}]

        with self.assertNumQueries(1):
            service._update_next_games_with_teamlog(payload)

        assert payload[0]["teamlog"][0]["event"] == "Touchdown"


class TestLivetickerQueryBudget(TestCase):
    def _games_with_ticks(self, count):
        gameday = GamedayFactory()
        games = []
        for index in range(count):
            game, home, _ = make_live_game(f"budget-{index}", gameday=gameday)
            for tick in range(7):
                TeamLogFactory(
                    gameinfo=game,
                    team=home,
                    author=gameday.author,
                    event="Touchdown",
                    created_time=time(10, tick),
                    half=1,
                    sequence=tick,
                )
            games.append(game)
        return gameday, games

    def test_ticks_for_all_games_are_one_query(self):
        gameday, games = self._games_with_ticks(5)
        service = LivetickerService([], [], [gameday.pk])
        payload = [{"id": game.pk} for game in games]

        with self.assertNumQueries(1):
            service._update_next_games_with_teamlog(payload)

        assert [len(game["teamlog"]) for game in payload] == [5] * 5

    def test_all_ticks_still_work_for_one_game(self):
        gameday, games = self._games_with_ticks(2)
        service = LivetickerService([], [games[0].pk], [gameday.pk])
        payload = [{"id": game.pk} for game in games]

        with self.assertNumQueries(1):
            service._update_next_games_with_teamlog(payload)

        assert len(payload[0]["teamlog"]) == 7
        assert len(payload[1]["teamlog"]) == 5


class TestAllResults(TestCase):
    def _finished_games(self, gameday, count):
        games = []
        for index in range(count):
            game, _, _ = make_live_game(
                f"finished-{index}",
                gameday=gameday,
                status="beendet",
                scheduled=time(10, index),
            )
            Gameinfo.objects.filter(pk=game.pk).update(gameFinished=time(11, index))
            games.append(game)
        return games

    def test_default_payload_keeps_the_latest_finished_slot(self):
        gameday = GamedayFactory()
        games = self._finished_games(gameday, 3)

        payload = LivetickerService([], [], [gameday.pk]).get_liveticker_as_json()

        assert [item["gameId"] for item in payload] == [games[-1].pk]

    def test_all_results_returns_every_finished_game_newest_first(self):
        gameday = GamedayFactory()
        games = self._finished_games(gameday, 3)

        payload = LivetickerService(
            [], [], [gameday.pk], all_results=True
        ).get_liveticker_as_json()

        assert [item["gameId"] for item in payload] == [
            game.pk for game in reversed(games)
        ]
        assert {item["status"] for item in payload} == {"beendet"}

    def test_all_results_query_count_does_not_grow_with_games(self):
        def count_queries(number_of_games):
            gameday = GamedayFactory()
            self._finished_games(gameday, number_of_games)
            service = LivetickerService([], [], [gameday.pk], all_results=True)
            with self.assertNumQueries(2):
                payload = service.get_liveticker_as_json()
            return len(payload)

        assert count_queries(2) == 2
        assert count_queries(6) == 6


class TestAllScheduled(TestCase):
    def _scheduled_games(self, gameday, count):
        games = []
        for index in range(count):
            game, _, _ = make_live_game(
                f"scheduled-{index}",
                gameday=gameday,
                status="Geplant",
                scheduled=time(12 + index, 0),
            )
            Gameinfo.objects.filter(pk=game.pk).update(gameFinished=None)
            games.append(game)
        return games

    def test_all_results_includes_every_scheduled_game(self):
        gameday = GamedayFactory()
        live, _, _ = make_live_game(
            "scheduled-live", gameday=gameday, scheduled=time(10, 0)
        )
        scheduled = self._scheduled_games(gameday, 2)

        legacy = LivetickerService([], [], [gameday.pk]).get_liveticker_as_json()
        payload = LivetickerService(
            [], [], [gameday.pk], all_results=True
        ).get_liveticker_as_json()

        legacy_ids = {item["gameId"] for item in legacy}
        ids = {item["gameId"] for item in payload}
        self.assertIn(live.pk, legacy_ids)
        self.assertNotIn(scheduled[1].pk, legacy_ids)
        self.assertTrue({game.pk for game in scheduled}.issubset(ids))

    def test_all_scheduled_query_count_is_flat(self):
        def count_queries(number_of_games):
            gameday = GamedayFactory()
            self._scheduled_games(gameday, number_of_games)
            service = LivetickerService([], [], [gameday.pk], all_results=True)
            with self.assertNumQueries(2):
                payload = service.get_liveticker_as_json()
            return len(payload)

        assert count_queries(2) == 2
        assert count_queries(6) == 6


class TestResolveGamedayIdsUsesBerlinDate(TestCase):
    @override_settings(DEBUG=False)
    def test_after_utc_midnight_the_berlin_date_selects_the_gameday(self):
        utc_day = GamedayFactory(date=date(2026, 5, 10))
        berlin_day = GamedayFactory(date=date(2026, 5, 11))
        # 2026-05-10 23:30 UTC is already 2026-05-11 01:30 in Berlin.
        utc_midnight_ish = datetime(2026, 5, 10, 23, 30, tzinfo=dt_timezone.utc)

        with mock.patch("django.utils.timezone.now", return_value=utc_midnight_ish):
            ids = resolve_gameday_ids([], None)

        assert ids == [berlin_day.pk]
        assert utc_day.pk not in ids

    @override_settings(DEBUG=False)
    def test_explicit_ids_still_win(self):
        gameday = GamedayFactory(date=date(2020, 1, 1))

        assert resolve_gameday_ids([gameday.pk], None) == [gameday.pk]
