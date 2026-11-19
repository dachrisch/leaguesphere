from datetime import datetime, time

from django.test import TestCase
from django.utils import timezone

from gamedays.models import League, Gameinfo, Gameresult
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamLogFactory
from liveticker.service.liveticker_service import LivetickerService
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
