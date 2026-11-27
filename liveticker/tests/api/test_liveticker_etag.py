"""ETag support for the liveticker API endpoint."""

from datetime import time
from unittest.mock import patch

from django.core.cache import cache
from django.test import Client, RequestFactory, TestCase
from django.urls import reverse
from django.utils import timezone

from gamedays.models import Gameinfo, Gameresult
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamFactory
from gamedays.tests.setup_factories.db_setup import DBSetup
from liveticker.api.urls import API_LIVETICKER_ALL
from liveticker.api.views import generate_liveticker_etag
from liveticker.service.liveticker_service import LivetickerService
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

    def test_a_partial_save_of_the_kickoff_bumps_updated_at(self):
        gameday = GamedayFactory()
        game, _, _ = make_live_game(
            "etag-save", gameday=gameday, status="beendet", scheduled=time(10, 0)
        )
        Gameinfo.objects.filter(pk=game.pk).update(gameFinished=time(11, 0))
        before = Gameinfo.objects.get(pk=game.pk)
        old_updated_at = before.updated_at
        url = f"{reverse(API_LIVETICKER_ALL)}?results=all&gameday={gameday.pk}"
        etag = self.client.get(url)["ETag"]

        before.scheduled = time(19, 0)
        before.save(update_fields=["scheduled"])
        after = Gameinfo.objects.get(pk=game.pk)

        self.assertGreater(after.updated_at, old_updated_at)
        response = self.client.get(url, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(response.status_code, 200)
        payload = next(item for item in response.json() if item["gameId"] == game.pk)
        self.assertIn("19:00", payload["scheduled_at"])

    def test_etag_query_count_is_flat_with_other_gamedays(self):
        gameday = GamedayFactory()
        make_live_game("etag-scope", gameday=gameday)
        request = RequestFactory().get(
            reverse(API_LIVETICKER_ALL), {"gameday": str(gameday.pk)}
        )

        with self.assertNumQueries(4):
            scoped = generate_liveticker_etag(request)

        other_gameday = GamedayFactory(name="Other season gameday")
        for index in range(50):
            make_live_game(f"etag-other-{index}", gameday=other_gameday)

        with self.assertNumQueries(4):
            self.assertEqual(generate_liveticker_etag(request), scoped)

    def test_two_stale_conditionals_render_the_service_once(self):
        gameday = GamedayFactory()
        game, _, _ = make_live_game(
            "etag-cache", gameday=gameday, status="beendet", scheduled=time(10, 0)
        )
        Gameinfo.objects.filter(pk=game.pk).update(gameFinished=time(11, 0))
        url = f"{reverse(API_LIVETICKER_ALL)}?results=all&gameday={gameday.pk}"
        stale = self.client.get(url)["ETag"]
        Gameinfo.objects.filter(pk=game.pk).update(
            scheduled=time(18, 30), updated_at=timezone.now()
        )

        original = LivetickerService.get_liveticker_as_json

        def render_once(service):
            return original(service)

        with patch.object(
            LivetickerService,
            "get_liveticker_as_json",
            autospec=True,
            side_effect=render_once,
        ) as render:
            first = self.client.get(url, HTTP_IF_NONE_MATCH=stale)
            second = self.client.get(url, HTTP_IF_NONE_MATCH=stale)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first["ETag"], second["ETag"])
        self.assertEqual(render.call_count, 1)
        payload = next(item for item in second.json() if item["gameId"] == game.pk)
        self.assertIn("18:30", payload["scheduled_at"])
