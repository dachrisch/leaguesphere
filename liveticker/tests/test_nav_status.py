"""The site header's single ticker entry (LIVE / heute / Liveticker).

The status rules live in ``test_today_status.py``; this module pins the
user-facing wiring: the context processor, the JSON the header polls, the two
rendered anchors (phone bar and desktop right block) and the removal of the old
"Live" dropdown.
"""

import re
from datetime import time
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.cache import caches
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from gamedays.constants import LEAGUE_GAMEDAY_LIST
from gamedays.models import Gameday, Gameinfo
from gamedays.tests.setup_factories.factories import GameinfoFactory, GamedayFactory
from league_manager.utils.url_service import UrlService
from league_manager.utils.utils import get_menu_items
from liveticker.constants import (
    LIVETICKER_HOME,
    LIVETICKER_STATUS,
    LIVETICKER_V2_HOME,
)
from liveticker.context_processors import live_nav
from liveticker.service.today_status import CACHE_ALIAS, CACHE_KEY
from liveticker.urls import gameday_ticker_url

# Anchors are read attribute by attribute, not as one fixed HTML string: the
# markup may gain utility classes without breaking these tests.
ANCHOR = re.compile(r"<a\b(?P<attrs>[^>]*)", re.S)
# Values are optional: ``data-live-nav`` is a bare flag attribute, the JS
# selector is ``[data-live-nav]``.
ATTRIBUTE = re.compile(r'(?P<name>[\w-]+)(?:="(?P<value>[^"]*)")?')

TICKER_JS = Path(settings.BASE_DIR) / "static" / "league_manager" / "js"


def attributes(anchor_html):
    return {
        attribute["name"]: attribute["value"] or ""
        for attribute in ATTRIBUTE.finditer(anchor_html)
    }


def ticker_anchors(html):
    return [
        attributes(match["attrs"])
        for match in ANCHOR.finditer(html)
        if "data-live-nav" in match["attrs"]
    ]


def make_live_gameday():
    gameday = GamedayFactory(date=timezone.localdate(), status=Gameday.STATUS_PUBLISHED)
    GameinfoFactory(gameday=gameday, scheduled=time(9, 0), status="1. Halbzeit")
    return gameday


class SnapshotCacheMixin:
    """Only today's snapshot key belongs to one test; it is a process-global cache."""

    def purge_status_cache(self):
        caches[CACHE_ALIAS].delete(
            CACHE_KEY.format(date=timezone.localdate().isoformat())
        )

    def setUp(self):
        super().setUp()
        self.purge_status_cache()
        self.addCleanup(self.purge_status_cache)


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestLiveNavContextProcessor(SnapshotCacheMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.request = RequestFactory().get("/")
        self.request.user = AnonymousUser()

    def test_live_gameday_today_renders_the_live_state(self):
        gameday = make_live_gameday()

        nav = live_nav(self.request)["live_nav"]

        assert nav["state"] == "live"
        assert nav["label"] == "LIVE"
        assert nav["live_count"] == 1
        assert nav["href"] == gameday_ticker_url(gameday)
        assert nav["aria_label"] == "Liveticker: Spiel läuft"

    def test_no_gameday_today_is_the_idle_link_to_the_overview(self):
        nav = live_nav(self.request)["live_nav"]

        assert nav == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": UrlService.build_absolute_url(LIVETICKER_V2_HOME),
            "aria_label": "Liveticker öffnen",
        }

    def test_cold_cache_costs_one_query_and_a_hit_none(self):
        make_live_gameday()

        with self.assertNumQueries(1):
            first = live_nav(self.request)
        with self.assertNumQueries(0):
            second = live_nav(self.request)

        assert first == second


@override_settings(LIVETICKER_V2_ENABLED=False)
class TestLiveNavFlagOff(TestCase):
    def test_plain_legacy_link_without_touching_the_database(self):
        make_live_gameday()

        with self.assertNumQueries(0):
            nav = live_nav(RequestFactory().get("/"))["live_nav"]

        assert nav == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": reverse(LIVETICKER_HOME),
            "aria_label": "Liveticker öffnen",
        }


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestStatusEndpoint(SnapshotCacheMixin, TestCase):
    def test_anonymous_get_returns_the_five_nav_keys(self):
        make_live_gameday()

        response = self.client.get(reverse(LIVETICKER_STATUS))

        assert response.status_code == 200
        assert response["Content-Type"].startswith("application/json")
        assert set(response.json()) == {
            "state",
            "label",
            "live_count",
            "href",
            "aria_label",
        }
        assert response.json()["state"] == "live"
        assert response.json()["label"] == "LIVE"

    def test_answer_is_cached_for_thirty_seconds(self):
        response = self.client.get(reverse(LIVETICKER_STATUS))

        assert "max-age=30" in response["Cache-Control"]

    def test_endpoint_url_is_public(self):
        assert reverse(LIVETICKER_STATUS) == "/liveticker/status/"


@override_settings(LIVETICKER_V2_ENABLED=False)
class TestStatusEndpointFlagOff(TestCase):
    def test_flag_off_returns_idle_and_the_legacy_link(self):
        response = self.client.get(reverse(LIVETICKER_STATUS))

        assert response.status_code == 200
        assert response.json() == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": reverse(LIVETICKER_HOME),
            "aria_label": "Liveticker öffnen",
        }


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestRenderedHeader(SnapshotCacheMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.content = self.client.get(reverse(LEAGUE_GAMEDAY_LIST)).content.decode()

    def test_exactly_two_ticker_anchors_with_href_state_and_aria(self):
        anchors = ticker_anchors(self.content)

        assert len(anchors) == 2
        for anchor in anchors:
            assert anchor["href"] == UrlService.build_absolute_url(LIVETICKER_V2_HOME)
            assert anchor["data-state"] == "idle"
            assert anchor["aria-label"] == "Liveticker öffnen"
            assert "ls-ticker" in anchor["class"].split()
            assert anchor["data-live-nav"] == ""

    def test_one_anchor_in_the_phone_bar_and_one_in_the_desktop_block(self):
        assert re.search(
            r'<div class="d-md-none me-auto">\s*<a\b[^>]*data-live-nav',
            self.content,
        )
        assert re.search(
            r'<div class="d-none d-md-flex align-items-center">\s*'
            r"<a\b[^>]*data-live-nav",
            self.content,
        )

    def test_no_dropdown_named_live_is_rendered(self):
        toggles = re.findall(
            r'<a class="nav-link dropdown-toggle"[^>]*>\s*(?P<name>[^<]+)',
            self.content,
        )

        assert "Live" not in [name.strip() for name in toggles]

    def test_login_anchor_sits_in_its_own_navbar_nav(self):
        assert re.search(
            r'<div class="navbar-nav">\s*<a class="nav-link" href="'
            + re.escape(reverse("login"))
            + r'">Login</a>',
            self.content,
        )

    def test_menu_list_carries_the_auto_right_margin(self):
        # me-md-auto, not ms-md-auto: the menu stays left and the right block
        # (ticker, Hilfe, Login) is pushed to the far right.
        assert re.search(
            r'<ul class="navbar-nav[^"]*\bme-md-auto\b[^"]*">', self.content
        )

    def test_header_loads_the_polling_script(self):
        assert "league_manager/js/live_nav.js" in self.content


class TestMenuRegistry(TestCase):
    def test_the_live_group_is_gone(self):
        request = RequestFactory().get("/")
        request.user = AnonymousUser()

        assert "Live" not in get_menu_items(request)


class TestPollingScript(TestCase):
    def test_script_polls_the_status_endpoint_every_minute_while_visible(self):
        source = (TICKER_JS / "live_nav.js").read_text()

        assert "/liveticker/status/" in source
        assert "setInterval" in source
        assert "60000" in source
        assert "visibilityState" in source
