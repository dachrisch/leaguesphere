from datetime import datetime, time
from http import HTTPStatus

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from django.urls import reverse
from django_webtest import WebTest

from gamedays.models import Gameinfo, Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameresultFactory,
    GameinfoFactory,
    TeamFactory,
)
from liveticker.api.urls import API_LIVETICKER_ALL


class TestLivetickerAPIView(WebTest):
    def test_no_liveticker_found(self):
        cache.clear()
        response = self.app.get(reverse(API_LIVETICKER_ALL))
        assert response.json == []

    @override_settings(LIVETICKER_CACHE_SECONDS=5)
    def test_cache_ttl_comes_from_the_setting(self):
        cache.clear()
        response = self.app.get(reverse(API_LIVETICKER_ALL))
        assert "max-age=5" in response.headers["Cache-Control"]

    def test_get_all_livetickers_only_scheduled(self):
        cache.clear()
        gameday_one = DBSetup().g62_status_empty()
        gameday_two = DBSetup().g62_status_empty()
        first_game_gameday_one = Gameinfo.objects.filter(gameday=gameday_one).first()
        first_game_gameday_two = Gameinfo.objects.filter(gameday=gameday_two).first()
        Gameday.objects.all().update(date=datetime.today())
        response = self.app.get(reverse(API_LIVETICKER_ALL))
        assert response.status_code == HTTPStatus.OK
        assert len(response.json) == 4
        expected_result = {
            "gameId": first_game_gameday_one.pk,
            "status": "Geplant",
            "standing": "Gruppe 1",
            "stage": "Vorrunde",
            "field": 1,
            "league": "some_division",
            "gameday": {
                "id": gameday_one.pk,
                "name": "Test Spieltag",
                "address": "",
            },
            "time": "10:00",
            "scheduled_at": timezone.make_aware(
                datetime.combine(gameday_one.date, time(10, 0))
            ).isoformat(),
            "tick_count": 0,
            "home": {
                "name": "A1",
                "full_name": "AAAAAAA1",
                "score": 3,
                "isInPossession": True,
                "logo": None,
                "fh": 2,
                "sh": 1,
            },
            "away": {
                "name": "A2",
                "full_name": "AAAAAAA2",
                "score": 2,
                "isInPossession": False,
                "logo": None,
                "fh": 1,
                "sh": 1,
            },
            "ticks": [],
        }
        assert response.json[0] == expected_result
        expected_result["gameId"] = first_game_gameday_two.pk
        expected_result["gameday"]["id"] = gameday_two.pk
        assert response.json[2] == expected_result

    def test_results_all_returns_every_finished_game(self):
        cache.clear()
        gameday = GamedayFactory()
        games = []
        for index in range(3):
            game = GameinfoFactory(
                gameday=gameday,
                scheduled=time(10, index),
                status="beendet",
                gameFinished=time(11, index),
            )
            GameresultFactory(
                gameinfo=game,
                team=TeamFactory(name=f"results-home-{index}"),
                fh=0,
                sh=0,
                isHome=True,
            )
            GameresultFactory(
                gameinfo=game,
                team=TeamFactory(name=f"results-away-{index}"),
                fh=0,
                sh=0,
            )
            games.append(game)
        Gameday.objects.filter(pk=gameday.pk).update(date=datetime.today().date())

        legacy = self.app.get(reverse(API_LIVETICKER_ALL))
        all_results = self.app.get(reverse(API_LIVETICKER_ALL), {"results": "all"})

        assert [item["gameId"] for item in legacy.json] == [games[-1].pk]
        assert {item["gameId"] for item in all_results.json} == {
            game.pk for game in games
        }
