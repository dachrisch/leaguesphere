"""The liveticker ETag with ``SCORECARD_EVENT_FEED`` on and off (T5).

Flag off the validator covers the rows the widget renders (results, ticks) plus
the ``Gameinfo`` state (kickoff, field, status, gameday). Flag on it also has to
move when an event arrives, including an event that writes no ``TeamLog`` row
(a plain possession change): otherwise a new event would answer a stale ``304``
and the widget would keep showing the old score for the life of the cache.
"""

from django.core.cache import cache
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import reverse

from gameevents.models import GameState
from gamedays.models import TeamLog
from liveticker.api.urls import API_LIVETICKER_ALL
from liveticker.api.views import generate_liveticker_etag
from liveticker.tests.event_feed_support import event, make_live_game, submit


def request_for(gameday_id):
    return RequestFactory().get(
        reverse(API_LIVETICKER_ALL), {"gameday": str(gameday_id)}
    )


class EventFeedEtagTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()
        self.game, _home, _away = make_live_game("etag")
        self.url = reverse(API_LIVETICKER_ALL)
        self.params = {"gameday": str(self.game.gameday_id)}

    def get(self, **headers):
        cache.clear()
        return self.client.get(self.url, self.params, **headers)

    @override_settings(SCORECARD_EVENT_FEED=False)
    def test_flag_off_etag_matches_the_generated_validator(self):
        submit(self.game, [event("score", "touchdown", "home", 7)], client_id="s1")

        response = self.get()

        assert response["ETag"] == generate_liveticker_etag(
            request_for(self.game.gameday_id)
        )

    @override_settings(SCORECARD_EVENT_FEED=False)
    def test_flag_off_does_not_see_a_projection_only_event(self):
        submit(self.game, [event("score", "touchdown", "home", 7)], client_id="s1")
        before = self.get()["ETag"]

        submit(self.game, [event("possession", "home")], client_id="s2")

        assert self.get()["ETag"] == before

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_a_new_event_changes_the_etag_even_without_a_new_tick(self):
        submit(self.game, [event("score", "touchdown", "home", 7)], client_id="s1")
        before = self.get()
        rows_before = TeamLog.objects.filter(gameinfo=self.game).count()

        submit(self.game, [event("possession", "home")], client_id="s2")

        assert TeamLog.objects.filter(gameinfo=self.game).count() == rows_before
        assert GameState.objects.get(game=self.game).last_seq == 2
        response = self.get(HTTP_IF_NONE_MATCH=before["ETag"])

        assert response.status_code == 200
        assert response["ETag"] != before["ETag"]
        assert response.json()[0]["home"]["score"] == 6

    @override_settings(SCORECARD_EVENT_FEED=True)
    def test_an_unchanged_game_still_answers_304(self):
        submit(self.game, [event("score", "touchdown", "home", 7)], client_id="s1")
        first = self.get()

        response = self.get(HTTP_IF_NONE_MATCH=first["ETag"])

        assert response.status_code == 304
        assert response.content == b""
        assert response["ETag"] == first["ETag"]
