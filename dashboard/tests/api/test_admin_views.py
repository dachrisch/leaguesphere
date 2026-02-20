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
        username="testuser", email="test@example.com", password="testpass123"
    )
    return user


@pytest.fixture
def authenticated_client(api_client, authenticated_user):
    api_client.force_authenticate(user=authenticated_user)
    return api_client


@pytest.mark.django_db
class TestAdminStatsAPIView:
    """Tests for admin stats API endpoints."""

    def test_admin_stats_requires_authentication(self, api_client):
        """Test admin-stats endpoint requires authentication."""
        response = api_client.get("/api/dashboard/admin-stats/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_admin_stats_endpoint_returns_data(self, authenticated_client):
        """Test admin-stats endpoint returns correct data structure."""
        response = authenticated_client.get("/api/dashboard/admin-stats/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert "stats" in data
        assert "games_per_league" in data
        assert "teams_per_league" in data
        assert "teams_per_association" in data
        assert "referees_per_team" in data
        assert "league_hierarchy" in data

        # Verify stats structure
        assert "gamedays" in data["stats"]
        assert "teams" in data["stats"]
        assert "games" in data["stats"]

    def test_games_per_league_endpoint_requires_auth(self, api_client):
        """Test games-per-league endpoint requires authentication."""
        response = api_client.get("/api/dashboard/games-per-league/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_games_per_league_endpoint(self, authenticated_client):
        """Test games-per-league endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/games-per-league/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "league_name" in data[0]
            assert "count" in data[0]

    def test_teams_per_league_endpoint_requires_auth(self, api_client):
        """Test teams-per-league endpoint requires authentication."""
        response = api_client.get("/api/dashboard/teams-per-league/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_teams_per_league_endpoint(self, authenticated_client):
        """Test teams-per-league endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/teams-per-league/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "league_name" in data[0]
            assert "count" in data[0]

    def test_teams_per_association_endpoint_requires_auth(self, api_client):
        """Test teams-per-association endpoint requires authentication."""
        response = api_client.get("/api/dashboard/teams-per-association/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_teams_per_association_endpoint(self, authenticated_client):
        """Test teams-per-association endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/teams-per-association/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "association_name" in data[0]
            assert "count" in data[0]

    def test_referees_per_team_endpoint_requires_auth(self, api_client):
        """Test referees-per-team endpoint requires authentication."""
        response = api_client.get("/api/dashboard/referees-per-team/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_referees_per_team_endpoint(self, authenticated_client):
        """Test referees-per-team endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/referees-per-team/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "team_id" in data[0]
            assert "team_name" in data[0]
            assert "count" in data[0]

    def test_league_hierarchy_endpoint(self, authenticated_client):
        """Test league-hierarchy endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/league-hierarchy/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "league_name" in data[0]
            assert "seasons" in data[0]
            assert isinstance(data[0]["seasons"], list)
