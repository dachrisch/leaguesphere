import json
from datetime import UTC, date, datetime, timedelta

from django.conf import settings
from django.utils import timezone


class AsJsonEncoder(json.JSONEncoder):
    def default(self, obj):
        if hasattr(obj, "as_json"):
            return obj.as_json()
        return json.JSONEncoder.default(self, obj)


def get_effective_today() -> date:
    """The date treated as "today" for gameday/game visibility.

    In DEBUG mode this is pinned to ``settings.DEBUG_DATE`` so local/dev/test
    environments can exercise "today"-dependent behavior (scorecard
    visibility, day_offset matching) against fixture data instead of the
    real calendar date.
    """
    if settings.DEBUG:
        return settings.DEBUG_DATE
    return datetime.today().date()


def utc_time_as_iso(time_value, ref_now=None) -> str:
    """Serialize a stored UTC wall-clock time as an explicit UTC ISO-8601 timestamp.

    ``TimeField`` columns (``TeamLog.created_time``, ``Gameinfo.gameStarted`` /
    ``gameHalftime`` / ``gameFinished``) hold only the UTC time-of-day, written
    from ``timezone.now()``. Recombining that time with a date and the UTC
    offset makes the value self-describing, so the frontend can render it in
    the viewer's local time.

    The date is chosen from the reference instant's surrounding days
    (yesterday / today / tomorrow) by picking the reconstruction closest to
    ``ref_now``. Pinning to a fixed "today" would shift the date — and with it
    the DST offset the frontend derives — by a full hour for live events that
    happened near UTC midnight (e.g. stored 23:50 UTC on a day whose UTC
    serialization runs after midnight).
    """
    if isinstance(time_value, datetime):
        time_value = time_value.time()
    if ref_now is None:
        ref_now = timezone.now()
    candidates = (
        datetime.combine(
            ref_now.date() + timedelta(days=offset), time_value, tzinfo=UTC
        )
        for offset in (-1, 0, 1)
    )
    closest = min(candidates, key=lambda dt: abs(dt - ref_now))
    return closest.isoformat()
