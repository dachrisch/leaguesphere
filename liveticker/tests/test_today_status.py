"""Rules for the shared "what happens on today's gamedays" resolver.

Both the gameday list (badges) and the site navigation read these statuses, so
the tests pin the exact precedence, the German labels and the query budget.
"""

from datetime import date, datetime, time
from unittest import mock
from zoneinfo import ZoneInfo

from django.core.cache import caches
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from gamedays.models import Gameday, Gameinfo
from gamedays.tests.setup_factories.factories import GameinfoFactory, GamedayFactory
from league_manager.utils.url_service import UrlService
from liveticker.constants import LIVETICKER_HOME, LIVETICKER_V2_HOME
from liveticker.service.today_status import nav_status, today_statuses
from liveticker.urls import gameday_ticker_url

BERLIN = ZoneInfo("Europe/Berlin")
TODAY = date(2026, 5, 10)
NOW = datetime(2026, 5, 10, 8, 55, tzinfo=BERLIN)

SNAPSHOT_CACHE = caches["snapshot"]


def berlin(hour, minute, *, day=TODAY):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=BERLIN)


def make_gameday(*, day=TODAY, status=Gameday.STATUS_PUBLISHED, games=()):
    gameday = GamedayFactory(date=day, status=status, name=f"Spieltag {day}")
    for scheduled, game_status in games:
        GameinfoFactory(gameday=gameday, scheduled=scheduled, status=game_status)
    return gameday


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestTodayStatuses(TestCase):
    def test_live_beats_done_and_soon(self):
        gameday = make_gameday(
            games=[
                (time(8, 0), Gameinfo.STATUS_COMPLETED),
                (time(9, 0), "1. Halbzeit"),
                (time(13, 0), Gameinfo.STATUS_PUBLISHED),
            ]
        )

        entry = today_statuses(now=NOW)[gameday.pk]

        assert entry == {
            "badge": "live",
            "label": "LIVE",
            "href": gameday_ticker_url(gameday),
            "live": True,
            "starts_at": berlin(9, 0),
        }

    def test_all_games_completed_is_done(self):
        gameday = make_gameday(
            games=[
                (time(8, 0), Gameinfo.STATUS_COMPLETED),
                (time(9, 0), Gameinfo.STATUS_COMPLETED),
            ]
        )

        entry = today_statuses(now=NOW)[gameday.pk]

        assert entry["badge"] == "done"
        assert entry["label"] == "beendet"
        assert entry["live"] is False
        assert entry["starts_at"] is None

    def test_completed_gameday_with_all_games_finished_is_done(self):
        # Production flips gameday.status to COMPLETED once the last game is
        # entered; the list must still show "beendet" for it.
        gameday = make_gameday(
            status=Gameday.STATUS_COMPLETED,
            games=[
                (time(8, 0), Gameinfo.STATUS_COMPLETED),
                (time(9, 0), Gameinfo.STATUS_COMPLETED),
            ],
        )

        entry = today_statuses(now=NOW)[gameday.pk]

        assert entry["badge"] == "done"
        assert entry["label"] == "beendet"
        assert entry["live"] is False
        assert entry["starts_at"] is None

    def test_next_game_at_least_five_minutes_past_is_late(self):
        gameday = make_gameday(
            games=[
                (time(8, 0), Gameinfo.STATUS_COMPLETED),
                (time(9, 0), Gameinfo.STATUS_PUBLISHED),
            ]
        )

        entry = today_statuses(now=berlin(9, 5))[gameday.pk]

        assert entry["badge"] == "late"
        assert entry["label"] == "verspätet"
        assert entry["live"] is False
        assert entry["starts_at"] == berlin(9, 0)

    def test_zero_to_four_minutes_past_reads_in_one_minute(self):
        gameday = make_gameday(games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)])

        entry = today_statuses(now=berlin(9, 3))[gameday.pk]

        assert entry["badge"] == "soon"
        assert entry["label"] == "in 1 Min"

    def test_next_game_starting_now_reads_in_one_minute(self):
        gameday = make_gameday(games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)])

        entry = today_statuses(now=berlin(9, 0))[gameday.pk]

        assert entry["label"] == "in 1 Min"

    def test_twenty_and_ninety_minutes_ahead(self):
        in_twenty = make_gameday(games=[(time(9, 15), Gameinfo.STATUS_PUBLISHED)])
        in_ninety = make_gameday(games=[(time(10, 25), Gameinfo.STATUS_PUBLISHED)])

        statuses = today_statuses(now=NOW)

        assert statuses[in_twenty.pk]["badge"] == "soon"
        assert statuses[in_twenty.pk]["label"] == "in 20 Min"
        assert statuses[in_ninety.pk]["badge"] == "soon"
        assert statuses[in_ninety.pk]["label"] == "in 90 Min"

    def test_later_than_ninety_minutes_shows_berlin_clock(self):
        gameday = make_gameday(games=[(time(13, 30), Gameinfo.STATUS_PUBLISHED)])

        entry = today_statuses(now=NOW)[gameday.pk]

        assert entry["badge"] == "later"
        assert entry["label"] == "heute 13:30"
        assert entry["live"] is False
        assert entry["starts_at"] == berlin(13, 30)

    def test_ninety_one_minutes_ahead_is_later(self):
        gameday = make_gameday(games=[(time(10, 26), Gameinfo.STATUS_PUBLISHED)])

        entry = today_statuses(now=NOW)[gameday.pk]

        assert entry["badge"] == "later"
        assert entry["label"] == "heute 10:26"

    def test_berlin_zone_is_pinned_when_the_process_zone_differs(self):
        late = make_gameday(games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)])
        soon = make_gameday(games=[(time(9, 15), Gameinfo.STATUS_PUBLISHED)])
        later = make_gameday(games=[(time(13, 30), Gameinfo.STATUS_PUBLISHED)])

        with timezone.override("UTC"):
            at_nine_oh_five = today_statuses(now=berlin(9, 5))
            at_eight_fifty_five = today_statuses(now=NOW)

        assert at_nine_oh_five[late.pk]["badge"] == "late"
        assert at_eight_fifty_five[soon.pk]["label"] == "in 20 Min"
        assert at_eight_fifty_five[later.pk]["label"] == "heute 13:30"
        assert at_eight_fifty_five[later.pk]["starts_at"] == berlin(13, 30)

    def test_zero_game_draft_and_other_day_gamedays_are_absent(self):
        zero_games = make_gameday()
        draft = make_gameday(
            status=Gameday.STATUS_DRAFT,
            games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)],
        )
        other_day = make_gameday(
            day=date(2026, 5, 11),
            games=[(time(9, 0), Gameinfo.STATUS_PUBLISHED)],
        )
        in_progress = make_gameday(
            status=Gameday.STATUS_IN_PROGRESS,
            games=[(time(9, 0), "2. Halbzeit")],
        )

        statuses = today_statuses(now=NOW)

        assert zero_games.pk not in statuses
        assert draft.pk not in statuses
        assert other_day.pk not in statuses
        assert statuses[in_progress.pk]["badge"] == "live"

    def test_cold_cache_costs_one_query_and_a_hit_none(self):
        gamedays = [
            GamedayFactory(date=TODAY, status=Gameday.STATUS_PUBLISHED)
            for _ in range(3)
        ]
        for gameday in gamedays:
            GameinfoFactory(
                gameday=gameday,
                scheduled=time(10, 0),
                status=Gameinfo.STATUS_PUBLISHED,
            )
        key = f"liveticker:today-status:{TODAY.isoformat()}"
        SNAPSHOT_CACHE.delete(key)
        self.addCleanup(SNAPSHOT_CACHE.delete, key)

        with (
            mock.patch(
                "liveticker.service.today_status.timezone.localdate",
                return_value=TODAY,
            ),
            mock.patch(
                "liveticker.service.today_status.timezone.now", return_value=NOW
            ),
        ):
            with self.assertNumQueries(1):
                first = today_statuses()
            with self.assertNumQueries(0):
                second = today_statuses()

        assert first == second
        assert set(first) == {gameday.pk for gameday in gamedays}
        assert SNAPSHOT_CACHE.get(key) == first

    def test_cache_read_error_still_returns_computed_statuses(self):
        gameday = make_gameday(games=[(time(9, 0), "1. Halbzeit")])
        cache = caches["snapshot"]
        key = f"liveticker:today-status:{TODAY.isoformat()}"
        cache.delete(key)
        self.addCleanup(cache.delete, key)

        with (
            mock.patch(
                "liveticker.service.today_status.timezone.localdate",
                return_value=TODAY,
            ),
            mock.patch(
                "liveticker.service.today_status.timezone.now", return_value=NOW
            ),
            mock.patch.object(cache, "get", side_effect=RuntimeError("cache down")),
        ):
            statuses = today_statuses()

        assert statuses[gameday.pk]["badge"] == "live"

    def test_cache_write_error_still_returns_computed_statuses(self):
        gameday = make_gameday(games=[(time(9, 0), "1. Halbzeit")])
        cache = caches["snapshot"]
        key = f"liveticker:today-status:{TODAY.isoformat()}"
        cache.delete(key)
        self.addCleanup(cache.delete, key)

        with (
            mock.patch(
                "liveticker.service.today_status.timezone.localdate",
                return_value=TODAY,
            ),
            mock.patch(
                "liveticker.service.today_status.timezone.now", return_value=NOW
            ),
            mock.patch.object(cache, "set", side_effect=RuntimeError("cache down")),
        ):
            statuses = today_statuses()

        assert statuses[gameday.pk]["badge"] == "live"

    def test_explicit_now_bypasses_the_cache(self):
        gameday = make_gameday(games=[(time(9, 15), Gameinfo.STATUS_PUBLISHED)])
        key = f"liveticker:today-status:{TODAY.isoformat()}"
        SNAPSHOT_CACHE.delete(key)
        self.addCleanup(SNAPSHOT_CACHE.delete, key)

        early = today_statuses(now=NOW)
        later = today_statuses(now=berlin(9, 14))

        assert early[gameday.pk]["label"] == "in 20 Min"
        assert later[gameday.pk]["label"] == "in 1 Min"
        assert SNAPSHOT_CACHE.get(key) is None


@override_settings(LIVETICKER_V2_ENABLED=True)
class TestNavStatus(TestCase):
    def test_one_of_several_live_gamedays_points_to_the_overview(self):
        make_gameday(games=[(time(9, 0), "1. Halbzeit")])
        make_gameday(games=[(time(8, 0), Gameinfo.STATUS_COMPLETED)])
        make_gameday(games=[(time(9, 10), Gameinfo.STATUS_PUBLISHED)])

        nav = nav_status(now=NOW)

        assert nav["state"] == "live"
        assert nav["label"] == "LIVE"
        assert nav["live_count"] == 1
        assert nav["href"] == UrlService.build_absolute_url(LIVETICKER_V2_HOME)
        assert nav["aria_label"] == "Liveticker: Spiel läuft"

    def test_single_live_gameday_links_to_its_ticker(self):
        gameday = make_gameday(games=[(time(9, 0), "2. Halbzeit")])

        nav = nav_status(now=NOW)

        assert nav["state"] == "live"
        assert nav["live_count"] == 1
        assert nav["href"] == gameday_ticker_url(gameday)
        assert nav["aria_label"] == "Liveticker: Spiel läuft"

    def test_single_finished_gameday_is_idle(self):
        make_gameday(games=[(time(8, 0), Gameinfo.STATUS_COMPLETED)])

        nav = nav_status(now=NOW)

        assert nav == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": UrlService.build_absolute_url(LIVETICKER_V2_HOME),
            "aria_label": "Liveticker öffnen",
        }

    def test_only_a_completed_gameday_is_idle(self):
        make_gameday(
            status=Gameday.STATUS_COMPLETED,
            games=[(time(8, 0), Gameinfo.STATUS_COMPLETED)],
        )

        nav = nav_status(now=NOW)

        assert nav == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": UrlService.build_absolute_url(LIVETICKER_V2_HOME),
            "aria_label": "Liveticker öffnen",
        }

    def test_one_live_plus_one_upcoming_gameday_uses_the_singular_aria(self):
        make_gameday(games=[(time(9, 0), "1. Halbzeit")])
        make_gameday(games=[(time(13, 30), Gameinfo.STATUS_PUBLISHED)])

        nav = nav_status(now=NOW)

        assert nav["state"] == "live"
        assert nav["live_count"] == 1
        assert nav["href"] == UrlService.build_absolute_url(LIVETICKER_V2_HOME)
        assert nav["aria_label"] == "Liveticker: Spiel läuft"

    def test_single_upcoming_gameday_links_to_its_ticker(self):
        gameday = make_gameday(games=[(time(13, 30), Gameinfo.STATUS_PUBLISHED)])

        nav = nav_status(now=NOW)

        assert nav["state"] == "today"
        assert nav["label"] == "heute"
        assert nav["live_count"] == 0
        assert nav["href"] == gameday_ticker_url(gameday)
        assert nav["aria_label"] == "Liveticker: heute Spieltag"

    def test_several_upcoming_gamedays_point_to_the_overview(self):
        make_gameday(games=[(time(13, 30), Gameinfo.STATUS_PUBLISHED)])
        make_gameday(games=[(time(14, 30), Gameinfo.STATUS_PUBLISHED)])

        nav = nav_status(now=NOW)

        assert nav["state"] == "today"
        assert nav["href"] == UrlService.build_absolute_url(LIVETICKER_V2_HOME)
        assert nav["aria_label"] == "Liveticker: heute 2 Spieltage"

    def test_two_live_gamedays_count_two(self):
        make_gameday(games=[(time(9, 0), "1. Halbzeit")])
        make_gameday(games=[(time(9, 0), "2. Halbzeit")])

        nav = nav_status(now=NOW)

        assert nav["live_count"] == 2
        assert nav["aria_label"] == "Liveticker: 2 Spieltage live"


@override_settings(LIVETICKER_V2_ENABLED=False)
class TestFlagOff(TestCase):
    def test_no_statuses_and_a_plain_legacy_link_without_queries(self):
        make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        with self.assertNumQueries(0):
            assert today_statuses(now=NOW) == {}
        with self.assertNumQueries(0):
            nav = nav_status(now=NOW)

        assert nav == {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": reverse(LIVETICKER_HOME),
            "aria_label": "Liveticker öffnen",
        }

    def test_no_statuses_without_explicit_now_also_skips_the_database(self):
        make_gameday(games=[(time(9, 0), "1. Halbzeit")])

        with self.assertNumQueries(0):
            assert today_statuses() == {}
        with self.assertNumQueries(0):
            nav_status()
