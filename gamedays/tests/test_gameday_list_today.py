"""The gameday list must use the Berlin date, not the server's UTC date."""

from datetime import date, datetime
from datetime import timezone as dt_timezone
from unittest import mock

from django.test import TestCase
from django.urls import reverse

from gamedays.constants import LEAGUE_GAMEDAY_LIST, LEAGUE_GAMEDAY_LIST_AND_YEAR
from gamedays.models import Gameday
from gamedays.tests.setup_factories.factories import GamedayFactory


class TestGamedayListStartsAtBerlinToday(TestCase):
    def test_after_utc_midnight_yesterdays_gameday_is_gone(self):
        GamedayFactory(date=date(2026, 5, 10), status=Gameday.STATUS_PUBLISHED)
        today_berlin = GamedayFactory(
            date=date(2026, 5, 11), status=Gameday.STATUS_PUBLISHED
        )
        # 2026-05-10 23:30 UTC is already 2026-05-11 01:30 in Berlin.
        utc_midnight_ish = datetime(2026, 5, 10, 23, 30, tzinfo=dt_timezone.utc)

        with mock.patch("django.utils.timezone.now", return_value=utc_midnight_ish):
            response = self.client.get(
                reverse(LEAGUE_GAMEDAY_LIST_AND_YEAR, kwargs={"season": 2026})
            )

        listed = [gameday.pk for gameday in response.context["gamedays"]]
        assert listed == [today_berlin.pk]

    def test_default_year_follows_berlin_new_year(self):
        new_year_berlin = GamedayFactory(
            date=date(2026, 1, 1), status=Gameday.STATUS_PUBLISHED
        )
        # 2025-12-31 23:30 UTC is already 2026-01-01 00:30 in Berlin, while a
        # naive server clock still says 2025.
        utc_new_years_eve = datetime(2025, 12, 31, 23, 30, tzinfo=dt_timezone.utc)

        with (
            mock.patch("django.utils.timezone.now", return_value=utc_new_years_eve),
            # Stub the pre-fix call site: if the view still read
            # datetime.today().year it would select season 2025.
            mock.patch("gamedays.views.datetime") as naive_datetime,
        ):
            naive_datetime.today.return_value = date(2025, 12, 31)
            response = self.client.get(reverse(LEAGUE_GAMEDAY_LIST))

        assert response.context["selected_season"] == 2026
        listed = [gameday.pk for gameday in response.context["gamedays"]]
        assert listed == [new_year_berlin.pk]
