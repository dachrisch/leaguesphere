from datetime import timedelta

from django.contrib.auth.models import User
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.api.views import GamedayListAPIView
from gamedays.models import Gameday
from gamedays.service.utils import get_effective_today
from gamedays.tests.setup_factories.factories import GamedayFactory, GameinfoFactory


class GamedayListMultiDayVisibilityTest(APITestCase):
    """The scorecard-facing '/api/gameday/list/' endpoint must show a gameday
    on every calendar day one of its games is actually played on -- not just
    the gameday's own `date` -- once that gameday has been published with
    `Gameinfo.day_offset` values reaching into later days.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="pw")
        self.client.force_authenticate(user=self.user)
        self.today = get_effective_today()

    def test_draft_gameday_with_no_games_still_appears_today(self):
        """Regression guard: a DRAFT gameday with zero Gameinfo rows must not
        be dropped by the added day_offset visibility check (which queries
        Gameinfo via a correlated subquery, not an inner join)."""
        gameday = GamedayFactory(date=self.today, status=Gameday.STATUS_DRAFT)

        response = self.client.get("/api/gameday/list/")

        assert response.status_code == status.HTTP_200_OK
        ids = [g["id"] for g in response.data]
        assert gameday.id in ids

    def test_published_multi_day_gameday_visible_on_later_day(self):
        gameday = GamedayFactory(date=self.today - timedelta(days=1))
        GameinfoFactory(gameday=gameday, day_offset=1)

        response = self.client.get("/api/gameday/list/")

        assert response.status_code == status.HTTP_200_OK
        ids = [g["id"] for g in response.data]
        assert gameday.id in ids

    def test_published_multi_day_gameday_not_visible_past_its_last_day(self):
        gameday = GamedayFactory(date=self.today - timedelta(days=2))
        GameinfoFactory(gameday=gameday, day_offset=1)

        response = self.client.get("/api/gameday/list/")

        assert response.status_code == status.HTTP_200_OK
        ids = [g["id"] for g in response.data]
        assert gameday.id not in ids

    def test_single_day_gameday_behaviour_is_unchanged(self):
        gameday = GamedayFactory(date=self.today)
        GameinfoFactory(gameday=gameday, day_offset=0)
        other_day_gameday = GamedayFactory(date=self.today - timedelta(days=1))
        GameinfoFactory(gameday=other_day_gameday, day_offset=0)

        response = self.client.get("/api/gameday/list/")

        ids = [g["id"] for g in response.data]
        assert gameday.id in ids
        assert other_day_gameday.id not in ids

    def test_visibility_filter_queryset_is_a_single_query(self):
        """Isolates the get_queryset() filter itself (not the endpoint's
        pre-existing ETag-precompute and per-object serializer queries) to
        confirm the day_offset visibility check stays a single correlated
        subquery rather than an extra round trip per row."""
        gameday = GamedayFactory(date=self.today - timedelta(days=1))
        GameinfoFactory(gameday=gameday, day_offset=1)
        GameinfoFactory(gameday=gameday, day_offset=1, field=2)

        view = GamedayListAPIView()
        with CaptureQueriesContext(connection) as ctx:
            list(view.get_queryset())

        assert len(ctx) == 1, "\n".join(q["sql"] for q in ctx.captured_queries)
