"""ETag support for the liveticker API endpoint."""

from django.core.cache import cache
from django.test import TestCase, Client
from django.urls import reverse

from gamedays.models import Gameinfo, Gameresult
from gamedays.tests.setup_factories.factories import TeamFactory
from gamedays.tests.setup_factories.db_setup import DBSetup
from liveticker.api.urls import API_LIVETICKER_ALL


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
