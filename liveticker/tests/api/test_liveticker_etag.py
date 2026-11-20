"""ETag support for the liveticker API endpoint."""

from datetime import time

from django.core.cache import cache
from django.test import TestCase, Client
from django.urls import reverse

from gamedays.models import Gameinfo, Gameresult
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamFactory
from gamedays.tests.setup_factories.db_setup import DBSetup
from liveticker.api.urls import API_LIVETICKER_ALL
from liveticker.tests.event_feed_support import make_live_game


class TestLivetickerEtag(TestCase):
    def setUp(self):
        self.client = Client()
        cache.clear()
        DBSetup().g62_finished()
        self.game = Gameinfo.objects.first()
        self.url = reverse(API_LIVETICKER_ALL)

    def test_response_has_etag(self):
        response = self.client.get(self.url)
        self.assertIn("ETag", response)

    def test_304_on_if_none_match(self):
        etag = self.client.get(self.url)["ETag"]
        response = self.client.get(self.url, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(response.status_code, 304)

    def test_etag_changes_when_new_tick_arrives(self):
        etag = self.client.get(self.url)["ETag"]
        home_team = TeamFactory(name="Etag Home")
        Gameresult.objects.create(
            gameinfo=self.game, team=home_team, fh=6, sh=0, pa=0, isHome=True
        )
        response = self.client.get(self.url, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(response.status_code, 200)

    def test_etag_changes_when_a_kickoff_is_edited(self):
        gameday = GamedayFactory()
        game, _, _ = make_live_game(
            "etag-kickoff", gameday=gameday, status="beendet", scheduled=time(10, 0)
        )
        Gameinfo.objects.filter(pk=game.pk).update(gameFinished=time(11, 0))
        url = f"{reverse(API_LIVETICKER_ALL)}?results=all&gameday={gameday.pk}"

        etag = self.client.get(url)["ETag"]
        Gameinfo.objects.filter(pk=game.pk).update(scheduled=time(18, 30))

        response = self.client.get(url, HTTP_IF_NONE_MATCH=etag)

        self.assertEqual(response.status_code, 200)
        payload = next(item for item in response.json() if item["gameId"] == game.pk)
        self.assertIn("18:30", payload["scheduled_at"])
