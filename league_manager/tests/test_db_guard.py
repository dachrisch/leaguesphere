import pytest
from django.urls import reverse
from unittest.mock import patch
from django.db import OperationalError

@pytest.mark.django_db
def test_db_guard_redirects_on_failure(client):
    """Test that the middleware redirects to database-error when DB is down."""
    # Ensure cache is clear for test
    from django.core.cache import cache
    cache.delete('db_connection_status')
    
    with patch('django.db.connection.cursor') as mock_cursor:
        mock_cursor.side_effect = OperationalError("DB is down")
        
        # Request any page that isn't excluded
        response = client.get('/')
        assert response.status_code == 302
        assert response.url == reverse('database-error')

@pytest.mark.django_db
def test_db_guard_skips_health_check(client):
    """Test that the middleware doesn't redirect health check even if DB is down."""
    from django.core.cache import cache
    cache.delete('db_connection_status')
    
    with patch('django.db.connection.cursor') as mock_cursor:
        mock_cursor.side_effect = OperationalError("DB is down")
        
        response = client.get('/health/')
        # Should NOT be a redirect
        assert response.status_code == 200
        # Body should contain failure info but status is 200
        # Depending on how django-health-check renders, we check for 'Database' failure
        assert b'Database' in response.content

@pytest.mark.django_db
def test_db_guard_skips_error_page(client):
    """Test that the middleware doesn't redirect when already on error page."""
    response = client.get(reverse('database-error'))
    assert response.status_code == 200
    assert b'Datenbank nicht erreichbar' in response.content
