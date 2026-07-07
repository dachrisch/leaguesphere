import pytest
from django.conf import settings
from django.urls import reverse
from unittest.mock import patch
from django.db import OperationalError
from django.core.cache import cache


def test_default_database_connect_timeout_is_bounded():
    """The DB connection must fail fast so the guard can render the offline page.

    Without a bounded connect_timeout, a degraded/unreachable host makes the
    guard's `SELECT 1` probe hang until nginx returns a 504, so users never see
    the "Datenbank nicht erreichbar" banner. The timeout must be short enough to
    stay well under the upstream proxy timeout.
    """
    options = settings.DATABASES["default"].get("OPTIONS", {})
    connect_timeout = options.get("connect_timeout")

    assert connect_timeout is not None, "default DATABASES OPTIONS must set connect_timeout"
    assert 0 < connect_timeout <= 5, f"connect_timeout must be short (got {connect_timeout})"


@pytest.fixture(autouse=True)
def clear_db_status_cache():
    """Clear the DB status cache before and after each test to ensure isolation."""
    cache.delete("db_connection_status")
    yield
    cache.delete("db_connection_status")


@pytest.mark.django_db
def test_db_guard_redirects_on_failure(client):
    """Test that the middleware redirects to database-error when DB is down."""
    # Ensure cache is clear for test
    cache.delete("db_connection_status")

    with patch("django.db.connection.cursor") as mock_cursor:
        mock_cursor.side_effect = OperationalError("DB is down")

        # Request any page that isn't excluded
        response = client.get("/")
        assert response.status_code == 302
        assert response.url == reverse("database-error")


@pytest.mark.django_db
def test_db_guard_skips_health_check(client):
    """Test that the middleware doesn't redirect health check even if DB is down."""
    cache.delete("db_connection_status")

    with patch("django.db.connection.cursor") as mock_cursor:
        mock_cursor.side_effect = OperationalError("DB is down")

        response = client.get("/health/")
        # Should NOT be a redirect
        assert response.status_code == 200
        # Simple health check returns {"status": "healthy"}
        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.django_db
def test_db_guard_shows_error_page_while_db_down(client):
    """While DB is down, the error page itself returns 503 (no redirect loop)."""
    # Simulate a known-down DB without breaking the test framework's own DB access.
    cache.set("db_connection_status", False, 5)

    response = client.get(reverse("database-error"))
    assert response.status_code == 503
    assert b"Datenbank nicht erreichbar" in response.content


@pytest.mark.django_db
def test_db_guard_redirects_back_home_when_db_online(client):
    """When the DB is back online, requesting the error page sends the user back to the app."""
    # DB is up in the test environment; ensure a fresh probe.
    cache.delete("db_connection_status")

    response = client.get(reverse("database-error"))
    assert response.status_code == 302
    assert response.url == "/"


@pytest.mark.django_db
def test_error_page_auto_refreshes_to_poll_for_recovery(client):
    """The offline page must auto-poll so it can return to the app once the DB recovers."""
    cache.set("db_connection_status", False, 5)

    response = client.get(reverse("database-error"))
    assert response.status_code == 503
    assert b'http-equiv="refresh"' in response.content
