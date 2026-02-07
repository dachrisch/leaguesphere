import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_user(db):
    user = User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="testpass123"
    )
    return user


@pytest.fixture
def authenticated_client(api_client, authenticated_user):
    api_client.force_authenticate(user=authenticated_user)
    return api_client


@pytest.mark.django_db
class TestDashboardAPI:
    def test_summary_requires_authentication(self, api_client):
        """Test that summary endpoint requires authentication."""
        response = api_client.get("/api/dashboard/summary/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_summary_with_authentication(self, authenticated_client):
        """Test that authenticated users can access summary."""
        response = authenticated_client.get("/api/dashboard/summary/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_games" in response.data
        assert "live_games" in response.data
        assert "total_teams" in response.data
        assert "total_players" in response.data
        assert "completion_rate" in response.data

    def test_live_games_requires_authentication(self, api_client):
        """Test that live games endpoint requires authentication."""
        response = api_client.get("/api/dashboard/live-games/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_live_games_with_authentication(self, authenticated_client):
        """Test that authenticated users can access live games."""
        response = authenticated_client.get("/api/dashboard/live-games/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_league_stats_requires_authentication(self, api_client):
        """Test that league stats endpoint requires authentication."""
        response = api_client.get("/api/dashboard/league/1/stats/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_league_stats_not_found(self, authenticated_client):
        """Test that non-existent league returns 404."""
        response = authenticated_client.get("/api/dashboard/league/99999/stats/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "error" in response.data
