"""The gameday list carries the shared ticker status on today's rows.

The status rules themselves live in ``liveticker/tests/test_today_status.py``;
this module pins the list wiring: one chip per today row, no chip elsewhere, the
chip as the only ticker link and a query budget that ignores the row count.
"""

import re
from datetime import time, timedelta

from django.core.cache import caches
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from gamedays.constants import LEAGUE_GAMEDAY_LIST
from gamedays.models import Gameday, Gameinfo
from gamedays.tests.setup_factories.factories import GameinfoFactory, GamedayFactory
from gamedays.tests.setup_factories.request_caches import pin_request_path_caches
from liveticker.urls import gameday_ticker_url

# The chip markup is part of the contract: badge class, ticker href, aria label.
CHIP = re.compile(
    r'<a class="gb gb--(?P<badge>[a-z]+)"\s+href="(?P<href>[^"]+)"\s+'
    r'aria-label="(?P<aria>[^"]+)">(?P<inner>.*?)</a>',
    re.S,
)


class GamedayListBadgesTestBase(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        # The resolver caches its one query for 30 s. A warm entry left by an
        # earlier test would hide the query-budget assertion.
        caches["snapshot"].clear()
        self.addCleanup(caches["snapshot"].clear)
        # Middleware liveness/maintenance probes are process-global caches too.
        pin_request_path_caches()

    def make_gameday(self, *, day=None, status=Gameday.STATUS_PUBLISHED, games=()):
        gameday = GamedayFactory(date=day or self.today, status=status)
        for scheduled, game_status in games:
            GameinfoFactory(gameday=gameday, scheduled=scheduled, status=game_status)
        return gameday

    def get_list(self):
        return self.client.get(reverse(LEAGUE_GAMEDAY_LIST))

    def chips(self, response):
        return [match.groupdict() for match in CHIP.finditer(response.content.decode())]


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestTodayGamedayChips(GamedayListBadgesTestBase):
    def test_live_gameday_renders_one_live_chip_linking_to_its_ticker(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        response = self.get_list()

        assert response.context["gamedays"][0].today_status["badge"] == "live"
        chips = self.chips(response)
        assert len(chips) == 1
        chip = chips[0]
        assert chip["badge"] == "live"
        assert chip["href"] == gameday_ticker_url(gameday)
        assert "LIVE" in chip["inner"]
        assert chip["aria"] == (
            f"Liveticker {gameday.league.name} {gameday.name}: LIVE"
        )

    def test_finished_gameday_renders_a_done_chip(self):
        self.make_gameday(
            games=[
                (time(9, 0), Gameinfo.STATUS_COMPLETED),
                (time(10, 0), Gameinfo.STATUS_COMPLETED),
            ]
        )

        chips = self.chips(self.get_list())

        assert len(chips) == 1
        assert chips[0]["badge"] == "done"
        assert "beendet" in chips[0]["inner"]

    def test_chip_is_the_only_ticker_link_for_the_row(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        content = self.get_list().content.decode()

        assert content.count(f'href="{gameday_ticker_url(gameday)}"') == 1

    def test_future_draft_and_zero_game_rows_have_no_chip(self):
        future = self.make_gameday(
            day=self.today + timedelta(days=1),
            games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)],
        )
        draft = self.make_gameday(
            status=Gameday.STATUS_DRAFT, games=[(time(9, 0), "1. Halbzeit")]
        )
        no_games = self.make_gameday()

        response = self.get_list()
        content = response.content.decode()

        assert self.chips(response) == []
        assert [row.today_status for row in response.context["gamedays"]] == [
            None,
            None,
            None,
        ]
        # Not even a stray link to a ticker that has no status.
        for gameday in (future, draft, no_games):
            assert f'href="{gameday_ticker_url(gameday)}"' not in content

    def test_query_count_does_not_grow_with_the_number_of_today_rows(self):
        url = reverse(LEAGUE_GAMEDAY_LIST)
        self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        caches["snapshot"].clear()
        with CaptureQueriesContext(connection) as one_row:
            self.client.get(url)

        for _ in range(3):
            self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        caches["snapshot"].clear()
        with CaptureQueriesContext(connection) as four_rows:
            self.client.get(url)

        assert len(one_row) > 0
        assert len(four_rows) == len(one_row)


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestFilterRowWraps(GamedayListBadgesTestBase):
    def test_filter_row_carries_the_flex_wrap_utility(self):
        # 390 px overflow: the season/league/all-games row has to wrap.
        filter_row = re.search(
            r'<div class="d-flex gap-2 mb-3[^"]*">', self.get_list().content.decode()
        )

        assert filter_row is not None
        assert "flex-wrap" in filter_row.group(0)


@override_settings(LIVETICKER_V2_ENABLED=False)
class TestFlagOff(GamedayListBadgesTestBase):
    def test_no_chip_when_the_v2_flag_is_off(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        response = self.get_list()

        assert self.chips(response) == []
        assert response.context["gamedays"][0].today_status is None
        assert f'href="{gameday_ticker_url(gameday)}"' not in response.content.decode()
