"""With the DB down and a cold cache, MaintenanceModeMiddleware's config lookup
used to 500 instead of showing the offline page.
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
    """DatabaseGuardMiddleware must run first so the outage redirects instead
    of crashing inside the maintenance lookup.
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
    """Independent of ordering, a failed lookup must be logged and fall back to
    scope 'off'. OperationalError alone is too narrow for this probe.
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
    """A failed lookup must not park scope 'off' in the cache for the TTL."""
    middleware = MaintenanceModeMiddleware(lambda request: "downstream-response")

    with patch(
        "league_manager.middleware.maintenance.SiteConfiguration.objects"
    ) as mock_manager:
        mock_manager.first.side_effect = OperationalError("DB is down")
        middleware(request=type("Req", (), {"path_info": "/home/", "method": "GET"})())

    assert cache.get(MAINTENANCE_CONFIG_CACHE_KEY) is None
