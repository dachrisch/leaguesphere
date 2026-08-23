"""
Name constants shared between `officials/urls.py` and `officials/views.py`.

`officials/urls.py` imports View classes from `officials/views.py` to build
its `path()` entries, so `views.py` can't import URL name constants back
from `urls.py` at module load time without a circular import - that's why
several views in this app fall back to importing from `officials.urls`
locally, inside the method that needs it. Constants used by a view (for
building `reverse()`/context URLs) belong here instead, in a module neither
`urls.py` nor `views.py` needs to import from the other to reach.
"""

OFFICIALS_STATISTICS = "view-officials-statistics"
OFFICIALS_STATISTICS_FOR_SEASON = "view-officials-statistics-for-season"
