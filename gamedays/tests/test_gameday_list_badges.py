"""The gameday list carries the shared ticker status on today's rows.

The status rules themselves live in ``liveticker/tests/test_today_status.py``;
this module pins the list wiring: one chip per today row, no chip elsewhere, the
chip as the only ticker link and a query budget that ignores the row count.
"""

import re
from datetime import date, time
from unittest import mock

from django.core.cache import caches
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from gamedays.constants import LEAGUE_GAMEDAY_LIST, LEAGUE_GAMEDAY_LIST_AND_YEAR
from gamedays.models import Gameday, Gameinfo
from gamedays.tests.setup_factories.factories import GameinfoFactory, GamedayFactory
from gamedays.tests.setup_factories.request_caches import pin_request_path_caches
from liveticker.service.today_status import CACHE_ALIAS, CACHE_KEY, today_statuses
from liveticker.urls import gameday_ticker_url

# Anchors are read attribute by attribute instead of as one fixed HTML string:
# the chip may gain utility classes or reorder attributes without breaking the
# tests. ``gb`` is the chip token, ``gb--<badge>`` the tint.
ANCHOR = re.compile(r"<a\b(?P<attrs>[^>]*)>(?P<inner>.*?)</a>", re.S)
ATTRIBUTE = re.compile(r'(?P<name>[\w-]+)="(?P<value>[^"]*)"')
TAGS = re.compile(r"<[^>]+>")


def anchors(html):
    anchors = []
    for match in ANCHOR.finditer(html):
        attrs = {
            attribute["name"]: attribute["value"]
            for attribute in ATTRIBUTE.finditer(match["attrs"])
        }
        anchors.append(
            {
                **attrs,
                "classes": attrs.get("class", "").split(),
                "inner": match["inner"],
            }
        )
    return anchors


def chips(html):
    return [anchor for anchor in anchors(html) if "gb" in anchor["classes"]]


def visible_text(inner_html):
    return " ".join(TAGS.sub(" ", inner_html).split())


class GamedayListBadgesTestBase(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        # Only today's key belongs to this test: the snapshot cache is a
        # process-global cache whose other entries xdist shards share.
        self.status_cache = caches[CACHE_ALIAS]
        self.status_cache_key = CACHE_KEY.format(date=self.today.isoformat())
        self.purge_status_cache()
        self.addCleanup(self.purge_status_cache)
        # Middleware liveness/maintenance probes are process-global caches too.
        pin_request_path_caches()

    def purge_status_cache(self):
        self.status_cache.delete(self.status_cache_key)

    def make_gameday(self, *, day=None, status=Gameday.STATUS_PUBLISHED, games=()):
        gameday = GamedayFactory(date=day or self.today, status=status)
        for scheduled, game_status in games:
            GameinfoFactory(gameday=gameday, scheduled=scheduled, status=game_status)
        return gameday

    def get_list(self, season=None):
        if season is None:
            return self.client.get(reverse(LEAGUE_GAMEDAY_LIST))
        return self.client.get(
            reverse(LEAGUE_GAMEDAY_LIST_AND_YEAR, kwargs={"season": season})
        )


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestTodayGamedayChips(GamedayListBadgesTestBase):
    def test_live_gameday_renders_one_live_chip_linking_to_its_ticker(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        response = self.get_list()

        assert response.context["gamedays"][0].today_status["badge"] == "live"
        rendered = chips(response.content.decode())
        assert len(rendered) == 1
        chip = rendered[0]
        assert "gb--live" in chip["classes"]
        assert chip["href"] == gameday_ticker_url(gameday)
        assert visible_text(chip["inner"]) == "LIVE"
        assert chip["aria-label"] == (
            f"Liveticker {gameday.league.name} {gameday.name}: LIVE"
        )

    def test_finished_gameday_renders_a_done_chip(self):
        self.make_gameday(
            games=[
                (time(9, 0), Gameinfo.STATUS_COMPLETED),
                (time(10, 0), Gameinfo.STATUS_COMPLETED),
            ]
        )

        rendered = chips(self.get_list().content.decode())

        assert len(rendered) == 1
        assert "gb--done" in rendered[0]["classes"]
        assert visible_text(rendered[0]["inner"]) == "beendet"

    def test_every_badge_tint_renders_its_label_and_aria_suffix(self):
        # The badge and its label come from the resolver (covered in
        # liveticker/tests); here every tint must reach the markup intact.
        gameday = self.make_gameday()
        href = gameday_ticker_url(gameday)
        cases = {
            "live": ("LIVE", True),
            "done": ("beendet", False),
            "late": ("verspätet", False),
            "soon": ("in 20 Min", False),
            "later": ("heute 13:30", False),
        }

        for badge, (label, live) in cases.items():
            with self.subTest(badge=badge):
                statuses = {
                    gameday.pk: {
                        "badge": badge,
                        "label": label,
                        "href": href,
                        "live": live,
                        "starts_at": None,
                    }
                }
                with mock.patch(
                    "gamedays.service.liveticker_hooks.today_statuses",
                    return_value=statuses,
                ):
                    rendered = chips(self.get_list().content.decode())

                assert len(rendered) == 1
                chip = rendered[0]
                assert f"gb--{badge}" in chip["classes"]
                assert visible_text(chip["inner"]) == label
                assert chip["aria-label"].endswith(f": {label}")

    def test_chip_is_the_only_anchor_to_the_ticker(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        content = self.get_list().content.decode()
        # The site header may point at the same ticker (its nav entry); the
        # gameday row itself must still carry exactly one link, the chip.
        body = content.split("</header>", 1)[-1]

        assert body.count(f'href="{gameday_ticker_url(gameday)}"') == 1

    def test_draft_and_zero_game_rows_today_have_no_chip(self):
        draft = self.make_gameday(
            status=Gameday.STATUS_DRAFT, games=[(time(9, 0), "1. Halbzeit")]
        )
        no_games = self.make_gameday()

        response = self.get_list()
        content = response.content.decode()

        assert chips(content) == []
        assert [row.today_status for row in response.context["gamedays"]] == [
            None,
            None,
        ]
        # Not even a stray link to a ticker that has no status.
        for gameday in (draft, no_games):
            assert f'href="{gameday_ticker_url(gameday)}"' not in content

    def test_future_gameday_row_has_no_chip(self):
        # Asked for through the year route instead of putting tomorrow on
        # today's list: today + 1 day crosses the year on 31 Dec, and the view
        # filters date__year, so the row would silently leave the page.
        next_year = self.today.year + 1
        future = self.make_gameday(
            day=date(next_year, 1, 2),
            games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)],
        )

        response = self.get_list(season=next_year)
        content = response.content.decode()

        assert chips(content) == []
        assert response.context["gamedays"][0].today_status is None
        assert f'href="{gameday_ticker_url(future)}"' not in content

    def test_query_count_does_not_grow_with_the_number_of_today_rows(self):
        url = reverse(LEAGUE_GAMEDAY_LIST)
        self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        self.purge_status_cache()
        with mock.patch(
            "gamedays.service.liveticker_hooks.today_statuses", wraps=today_statuses
        ) as one_row_statuses:
            with CaptureQueriesContext(connection) as one_row:
                self.client.get(url)

        for _ in range(3):
            self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        self.purge_status_cache()
        # One call for four rows: a per-row call would not show up in the query
        # count, because the 30 s cache answers calls 2-4 from memory.
        with mock.patch(
            "gamedays.service.liveticker_hooks.today_statuses", wraps=today_statuses
        ) as four_row_statuses:
            with CaptureQueriesContext(connection) as four_rows:
                self.client.get(url)

        assert len(one_row) > 0
        assert len(four_rows) == len(one_row)
        assert one_row_statuses.call_count == 1
        assert four_row_statuses.call_count == 1


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestFilterRowWraps(GamedayListBadgesTestBase):
    def test_filter_row_carries_the_flex_wrap_utility(self):
        # 390 px overflow: the season/league/all-games row has to wrap.
        filter_row = re.search(
            r'<div class="d-flex gap-2 mb-3[^"]*">',
            self.get_list().content.decode(),
        )

        assert filter_row is not None
        assert "flex-wrap" in filter_row.group(0)


@override_settings(LIVETICKER_V2_ENABLED=False)
class TestFlagOff(GamedayListBadgesTestBase):
    def test_no_chip_when_the_v2_flag_is_off(self):
        gameday = self.make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        response = self.get_list()

        assert chips(response.content.decode()) == []
        assert response.context["gamedays"][0].today_status is None
        assert f'href="{gameday_ticker_url(gameday)}"' not in response.content.decode()
