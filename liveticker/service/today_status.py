"""Resolve what is happening on today's gamedays, for the list and the nav.

One implementation serves both surfaces so a gameday row and the site
navigation can never disagree about whether a game is live. Everything is
computed from a single annotated queryset and cached for 30 seconds: the
gameday list is read-heavy and anonymous, and the status changes at most every
few minutes.
"""

from datetime import datetime, timedelta
from math import ceil
from typing import Dict, Optional

from django.conf import settings
from django.core.cache import caches
from django.db.models import Count, Exists, Min, OuterRef, Q
from django.urls import reverse
from django.utils import timezone

from gamedays.models import Gameday, Gameinfo
from league_manager.utils.url_service import UrlService
from liveticker.constants import LIVETICKER_HOME, LIVETICKER_V2_HOME
from liveticker.service.liveticker_service import LIVE_STATUSES
from liveticker.urls import gameday_ticker_url

CACHE_ALIAS = "snapshot"
CACHE_KEY = "liveticker:today-status:{date}"
CACHE_SECONDS = 30

# A scheduled game that never started is "verspätet" once it is this late, and
# only games starting within this window read "in N Min" instead of a clock time.
LATE_AFTER = timedelta(minutes=5)
SOON_WITHIN = timedelta(minutes=90)

CONSIDERED_STATUSES = (Gameday.STATUS_PUBLISHED, Gameday.STATUS_IN_PROGRESS)


def today_statuses(now: Optional[datetime] = None) -> Dict[int, dict]:
    """{gameday_id: {"badge", "label", "href", "live", "starts_at"}}.

    Only published/in-progress gamedays dated today with at least one game are
    included, so a freshly published gameday without a schedule never reads
    "beendet". Passing ``now`` bypasses the cache (tests need determinism); the
    normal call site reads or fills the shared snapshot cache.
    """
    if not _v2_enabled():
        return {}

    if now is not None:
        return _compute_statuses(timezone.localdate(now), now)

    today = timezone.localdate()
    cache = caches[CACHE_ALIAS]
    key = CACHE_KEY.format(date=today.isoformat())
    statuses = cache.get(key)
    if statuses is None:
        statuses = _compute_statuses(today, timezone.now())
        cache.set(key, statuses, CACHE_SECONDS)
    return statuses


def nav_status(now: Optional[datetime] = None) -> dict:
    """The single navigation entry derived from the same gameday statuses."""
    if not _v2_enabled():
        return {
            "state": "idle",
            "label": "Liveticker",
            "live_count": 0,
            "href": reverse(LIVETICKER_HOME),
            "aria_label": "Liveticker öffnen",
        }

    statuses = today_statuses(now)
    live_count = sum(1 for entry in statuses.values() if entry["live"])
    if live_count:
        state, label = "live", "LIVE"
    elif any(entry["badge"] != "done" for entry in statuses.values()):
        state, label = "today", "heute"
    else:
        state, label = "idle", "Liveticker"

    if len(statuses) == 1 and state in ("live", "today"):
        href = next(iter(statuses.values()))["href"]
    else:
        href = UrlService.build_absolute_url(LIVETICKER_V2_HOME)

    return {
        "state": state,
        "label": label,
        "live_count": live_count,
        "href": href,
        "aria_label": _aria_label(state, live_count, len(statuses)),
    }


def _compute_statuses(today, now) -> Dict[int, dict]:
    """One query for every considered gameday; no query per gameday."""
    gamedays = (
        Gameday.objects.filter(date=today, status__in=CONSIDERED_STATUSES)
        .annotate(
            game_count=Count("gameinfo"),
            is_live=Exists(
                Gameinfo.objects.filter(
                    gameday=OuterRef("pk"), status__in=LIVE_STATUSES
                )
            ),
            next_time=Min(
                "gameinfo__scheduled",
                filter=~Q(gameinfo__status=Gameinfo.STATUS_COMPLETED),
            ),
        )
        .select_related("league")
    )

    statuses = {}
    for gameday in gamedays:
        if gameday.game_count == 0:
            # A published gameday without a schedule has no status at all.
            continue
        statuses[gameday.pk] = _status_for(gameday, now)
    return statuses


def _status_for(gameday, now) -> dict:
    href = gameday_ticker_url(gameday)
    starts_at = _starts_at(gameday)

    if gameday.is_live:
        badge, label, live = "live", "LIVE", True
    elif gameday.next_time is None:
        # Every game is completed (there is at least one).
        badge, label, live = "done", "beendet", False
    else:
        delta = starts_at - now
        if delta <= -LATE_AFTER:
            badge, label = "late", "verspätet"
        elif delta <= SOON_WITHIN:
            # 0-4 minutes past still read "in 1 Min", never "in 0 Min".
            minutes = max(1, ceil(delta.total_seconds() / 60))
            badge, label = "soon", f"in {minutes} Min"
        else:
            badge, label = "later", f"heute {timezone.localtime(starts_at):%H:%M}"
        live = False

    return {
        "badge": badge,
        "label": label,
        "href": href,
        "live": live,
        "starts_at": starts_at,
    }


def _starts_at(gameday) -> Optional[datetime]:
    if gameday.next_time is None:
        return None
    return timezone.make_aware(datetime.combine(gameday.date, gameday.next_time))


def _aria_label(state: str, live_count: int, gameday_count: int) -> str:
    if state == "live":
        # Singular only for the single-gameday day; a busy day counts the
        # gamedays that are actually live.
        if live_count == 1 and gameday_count == 1:
            return "Liveticker: Spiel läuft"
        return f"Liveticker: {live_count} Spieltage live"
    if state == "today":
        if gameday_count == 1:
            return "Liveticker: heute Spieltag"
        return f"Liveticker: heute {gameday_count} Spieltage"
    return "Liveticker öffnen"


def _v2_enabled() -> bool:
    return bool(getattr(settings, "LIVETICKER_V2_ENABLED", False))
