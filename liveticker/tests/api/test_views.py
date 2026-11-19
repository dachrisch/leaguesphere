from datetime import datetime, time
from http import HTTPStatus

from django.core.cache import cache
from django.utils import timezone
from django.urls import reverse
from django_webtest import WebTest

from gamedays.models import Gameinfo, Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup
from liveticker.api.urls import API_LIVETICKER_ALL


class TestLivetickerAPIView(WebTest):
    def test_no_liveticker_found(self):
        cache.clear()
        response = self.app.get(reverse(API_LIVETICKER_ALL))
        assert response.json == []

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
