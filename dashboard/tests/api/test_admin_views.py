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
        assert "spiele_pro_liga" in data
        assert "teams_pro_liga" in data
        assert "teams_pro_landesverband" in data
        assert "schiedsrichter_pro_team" in data

        # Verify stats structure
        assert "spieltage" in data["stats"]
        assert "teams" in data["stats"]
        assert "spiele" in data["stats"]

    def test_spiele_pro_liga_endpoint_requires_auth(self, api_client):
        """Test spiele-pro-liga endpoint requires authentication."""
        response = api_client.get("/api/dashboard/spiele-pro-liga/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_spiele_pro_liga_endpoint(self, authenticated_client):
        """Test spiele-pro-liga endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/spiele-pro-liga/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "liga_name" in data[0]
            assert "count" in data[0]

    def test_teams_pro_liga_endpoint_requires_auth(self, api_client):
        """Test teams-pro-liga endpoint requires authentication."""
        response = api_client.get("/api/dashboard/teams-pro-liga/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_teams_pro_liga_endpoint(self, authenticated_client):
        """Test teams-pro-liga endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/teams-pro-liga/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "liga_name" in data[0]
            assert "count" in data[0]

    def test_teams_pro_landesverband_endpoint_requires_auth(self, api_client):
        """Test teams-pro-landesverband endpoint requires authentication."""
        response = api_client.get("/api/dashboard/teams-pro-landesverband/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_teams_pro_landesverband_endpoint(self, authenticated_client):
        """Test teams-pro-landesverband endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/teams-pro-landesverband/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "landesverband_name" in data[0]
            assert "count" in data[0]

    def test_schiedsrichter_pro_team_endpoint_requires_auth(self, api_client):
        """Test schiedsrichter-pro-team endpoint requires authentication."""
        response = api_client.get("/api/dashboard/schiedsrichter-pro-team/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_schiedsrichter_pro_team_endpoint(self, authenticated_client):
        """Test schiedsrichter-pro-team endpoint returns data."""
        response = authenticated_client.get("/api/dashboard/schiedsrichter-pro-team/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert isinstance(data, list)
        if data:
            assert "team_id" in data[0]
            assert "team_name" in data[0]
            assert "count" in data[0]
