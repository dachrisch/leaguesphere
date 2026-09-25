"""MaintenanceModeMiddleware queries SiteConfiguration on a cache miss with no
try/except. With the DB down and a cold cache (e.g. every worker after a
restart), that raised OperationalError and produced a 500 instead of the
"database offline" page, because DatabaseGuardMiddleware -- which exists to
handle exactly this -- ran after it in MIDDLEWARE.
"""

from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.db import OperationalError

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


def test_maintenance_middleware_survives_db_error_on_cold_cache():
    """Even called directly (independent of ordering), the maintenance
    middleware must not propagate an OperationalError from a cold-cache
    lookup -- it should fall back to scope 'off' and let the request through.
    """
    calls = []

    def get_response(request):
        calls.append(request)
        return "downstream-response"

    middleware = MaintenanceModeMiddleware(get_response)

    with patch(
        "league_manager.middleware.maintenance.SiteConfiguration.objects"
    ) as mock_manager:
        mock_manager.first.side_effect = OperationalError("DB is down")

        result = middleware(
            request=type("Req", (), {"path_info": "/home/", "method": "GET"})()
        )

    assert result == "downstream-response"
    assert len(calls) == 1
