"""Pin the middleware caches a request path reads, so query-count tests stay deterministic.

Two process-global LocMemCache entries are read on every request:

* ``DatabaseGuardMiddleware`` caches its liveness probe (``db_connection_status``,
  10 s TTL),
* ``MaintenanceModeMiddleware`` caches the ``SiteConfiguration`` lookup
  (``MAINTENANCE_CONFIG_CACHE_KEY``, 30 s TTL).

Both are process-global, so a query-count assertion that does not control them
depends on which test ran before it on the same xdist worker. A "warm-up
request" is **not** enough: under CI load the round-trip can outlast the TTL, the
measured request pays the query again and the count flips by one or two (seen on
CircleCI for ``gamedays/tests/test_views.py`` and
``gamedays/tests/test_tournament_views.py`` - ``12 != 11``, with ``SELECT 1`` as
the extra query).

Setting both keys directly removes the timing dependency instead of racing it.
``matchreport/tests/test_views.py`` keeps an equivalent private helper; this is
the shared version for the other shards.
"""

from django.core.cache import cache

from league_manager.constants import (
    MAINTENANCE_CONFIG_CACHE_KEY,
    MAINTENANCE_CONFIG_CACHE_TTL,
    MAINTENANCE_SCOPE_OFF,
)

DB_STATUS_CACHE_KEY = "db_connection_status"
DB_STATUS_CACHE_TTL = 10


def pin_request_path_caches() -> None:
    """Mark the DB-guard and maintenance caches as warm for the next request."""
    cache.set(DB_STATUS_CACHE_KEY, True, DB_STATUS_CACHE_TTL)
    cache.set(
        MAINTENANCE_CONFIG_CACHE_KEY,
        {"scope": MAINTENANCE_SCOPE_OFF, "patterns": []},
        MAINTENANCE_CONFIG_CACHE_TTL,
    )
