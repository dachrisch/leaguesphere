"""Template variables for the site header.

The ticker entry is part of the chrome on every page, so it is a context
processor instead of a per-view argument. ``nav_status`` is cached for 30
seconds, which keeps the cost at one query per window even on a page that is
rendered thousands of times a day.
"""

import logging

from liveticker.service.today_status import legacy_nav_status, nav_status

logger = logging.getLogger(__name__)


def live_nav(request):
    """The header's ticker entry; a broken status must never 500 a page."""
    try:
        nav = nav_status()
    except Exception:  # noqa: BLE001 - the chrome must not break a page render
        logger.exception("liveticker nav status failed")
        nav = legacy_nav_status()
    return {"live_nav": nav}
