"""Template variables for the site header.

The ticker entry is part of the chrome on every page, so it is a context
processor instead of a per-view argument. ``nav_status`` is cached for 30
seconds, which keeps the cost at one query per window even on a page that is
rendered thousands of times a day.
"""

from liveticker.service.today_status import nav_status


def live_nav(request):
    return {"live_nav": nav_status()}
