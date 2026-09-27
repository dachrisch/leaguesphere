"""MaintenanceModeMiddleware queries SiteConfiguration on a cache miss with no
try/except. With the DB down and a cold cache (e.g. every worker after a
restart), that raised OperationalError and produced a 500 instead of the
"database offline" page, because DatabaseGuardMiddleware -- which exists to
handle exactly this -- ran after it in MIDDLEWARE.
"""

from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError, InterfaceError, OperationalError

from league_manager.constants import MAINTENANCE_CONFIG_CACHE_KEY
from league_manager.middleware.maintenance import MaintenanceModeMiddleware


@pytest.fixture(autouse=True)
def clear_caches():
    cache.delete("db_connection_status")
    cache.delete(MAINTENANCE_CONFIG_CACHE_KEY)
    yield
    cache.delete("db_connection_status")
    cache.delete(MAINTENANCE_CONFIG_CACHE_KEY)


@pytest.mark.django_db
def test_db_down_with_cold_caches_shows_offline_page_not_500(client):
    """DatabaseGuardMiddleware must run before MaintenanceModeMiddleware so a
    DB outage on a cold cache redirects to the offline page instead of
    crashing inside the maintenance lookup.
    """
    with patch("league_manager.middleware.db_guard.connection.cursor") as mock_cursor:
        mock_cursor.side_effect = OperationalError("DB is down")

        response = client.get("/home/")

    assert response.status_code == 302
    assert response.url == "/database-error/"


@pytest.mark.parametrize(
    "error",
    [
        OperationalError("DB is down"),
        InterfaceError("connection already closed"),
        DatabaseError("deadlock / lock wait timeout"),
        ImproperlyConfigured("settings.DATABASES is improperly configured"),
    ],
    ids=lambda error: type(error).__name__,
)
def test_maintenance_middleware_survives_db_error_on_cold_cache(error, caplog):
    """Even called directly (independent of ordering), the maintenance
    middleware must not propagate a failure from a cold-cache lookup -- it
    should log it, fall back to scope 'off' and let the request through.
    OperationalError alone is too narrow: InterfaceError, DatabaseError
    wrappers and ImproperlyConfigured all surface from the same probe.
    """
    calls = []

    def get_response(request):
        calls.append(request)
        return "downstream-response"

    middleware = MaintenanceModeMiddleware(get_response)

    with (
        patch(
            "league_manager.middleware.maintenance.SiteConfiguration.objects"
        ) as mock_manager,
        caplog.at_level("ERROR", logger="league_manager.middleware.maintenance"),
    ):
        mock_manager.first.side_effect = error

        result = middleware(
            request=type("Req", (), {"path_info": "/home/", "method": "GET"})()
        )

    assert result == "downstream-response"
    assert len(calls) == 1
    assert str(error) in caplog.text


def test_maintenance_middleware_does_not_cache_fallback_after_db_error():
    """A failed lookup must not park scope 'off' in the cache for the TTL:
    the next request should retry so maintenance mode is honoured as soon as
    the database is reachable again.
    """
    middleware = MaintenanceModeMiddleware(lambda request: "downstream-response")

    with patch(
        "league_manager.middleware.maintenance.SiteConfiguration.objects"
    ) as mock_manager:
        mock_manager.first.side_effect = OperationalError("DB is down")
        middleware(request=type("Req", (), {"path_info": "/home/", "method": "GET"})())

    assert cache.get(MAINTENANCE_CONFIG_CACHE_KEY) is None
