from datetime import date, timedelta

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.models import Gameday, GamedayDesignerState
from gamedays.tests.setup_factories.factories import GamedayFactory


class GamedayListDesignerFilterTest(APITestCase):
    """The Gameday Designer dashboard only wants gamedays that have a designer
    state. That filtering must happen server-side: the list is paginated
    (page_size=100, ordered by date asc), so the dashboard cannot reliably
    filter a single page client-side -- recent designer gamedays end up on
    later pages and disappear from the list.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="pw")
        self.client.force_authenticate(user=self.user)

    def _make_gameday(self, name, on_date, with_state=False, **kwargs):
        gameday = GamedayFactory(name=name, date=on_date, **kwargs)
        if with_state:
            GamedayDesignerState.objects.create(
                gameday=gameday, state_data={"nodes": [], "edges": []}
            )
        return gameday

    def test_list_can_filter_to_only_gamedays_with_designer_state(self):
        with_state = self._make_gameday("With Designer", date(2026, 6, 24), with_state=True)
        self._make_gameday("No Designer", date(2021, 1, 1), with_state=False)

        response = self.client.get("/api/gamedays/?has_designer_state=true")

        assert response.status_code == status.HTTP_200_OK
        ids = [g["id"] for g in response.data["results"]]
        assert ids == [with_state.id], (
            f"expected only the designer gameday {with_state.id}, got {ids}"
        )

    def test_designer_gameday_is_returned_even_when_beyond_first_page(self):
        # Reproduces the production bug: many older gamedays without designer
        # state fill the first page (page_size=100, date asc), pushing the
        # recent designer gameday onto a later page the dashboard never fetched.
        base = GamedayFactory(name="filler-base", date=date(2020, 1, 1))
        Gameday.objects.bulk_create(
            [
                Gameday(
                    name=f"old-{i}",
                    date=date(2020, 1, 1) + timedelta(days=i + 1),
                    start="10:00",
                    format="6_2",
                    season=base.season,
                    league=base.league,
                    author=base.author,
                )
                for i in range(100)
            ]
        )
        designer = self._make_gameday(
            "Recent Designer", date(2026, 6, 24), with_state=True,
            season=base.season, league=base.league, author=base.author,
        )

        response = self.client.get("/api/gamedays/?has_designer_state=true")

        assert response.status_code == status.HTTP_200_OK
        ids = [g["id"] for g in response.data["results"]]
        assert designer.id in ids, (
            "designer gameday must be returned regardless of pagination; "
            f"got {len(ids)} results without it"
        )
