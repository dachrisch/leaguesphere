"""The pin helper must leave both middleware caches readable and warm.

Query-count tests depend on this: if a key is missing or holds a "down"/"on"
value, the measured request pays extra queries (or short-circuits), and the count
flips depending on which test ran before on the same xdist worker.
"""

from django.core.cache import cache

from gamedays.tests.setup_factories.request_caches import (
    DB_STATUS_CACHE_KEY,
    pin_request_path_caches,
)
from league_manager.constants import MAINTENANCE_CONFIG_CACHE_KEY, MAINTENANCE_SCOPE_OFF


def test_pin_sets_both_middleware_caches():
    cache.clear()

    pin_request_path_caches()

    assert cache.get(DB_STATUS_CACHE_KEY) is True
    assert cache.get(MAINTENANCE_CONFIG_CACHE_KEY) == {
        "scope": MAINTENANCE_SCOPE_OFF,
        "patterns": [],
    }


def test_pin_overwrites_a_cold_cache():
    """A previously failed/absent probe must not leak into the measured request."""
    cache.set(DB_STATUS_CACHE_KEY, False, 10)
    cache.delete(MAINTENANCE_CONFIG_CACHE_KEY)

    pin_request_path_caches()

    assert cache.get(DB_STATUS_CACHE_KEY) is True
    assert cache.get(MAINTENANCE_CONFIG_CACHE_KEY)["scope"] == MAINTENANCE_SCOPE_OFF
