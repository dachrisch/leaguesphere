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


@pytest.mark.django_db
class TestSaaSAdminDashboardAPI:
    """Tests for SaaS Admin Dashboard endpoints."""

    def test_platform_health_requires_authentication(self, api_client):
        """Test that platform health endpoint requires authentication."""
        response = api_client.get("/api/dashboard/platform-health/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_platform_health_with_authentication(self, authenticated_client):
        """Test that authenticated users can access platform health."""
        response = authenticated_client.get("/api/dashboard/platform-health/")
        assert response.status_code == status.HTTP_200_OK
        assert "active_today" in response.data
        assert "active_7d" in response.data
        assert "trend_7d" in response.data
        assert "total_users" in response.data
        assert "team_managers" in response.data
        assert "officials" in response.data
        assert "players" in response.data
        assert "new_users_30d" in response.data
        assert "avg_new_per_week" in response.data

    def test_recent_activity_requires_authentication(self, api_client):
        """Test that recent activity endpoint requires authentication."""
        response = api_client.get("/api/dashboard/recent-activity/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_recent_activity_with_authentication(self, authenticated_client):
        """Test that authenticated users can access recent activity."""
        response = authenticated_client.get("/api/dashboard/recent-activity/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_recent_activity_with_params(self, authenticated_client):
        """Test recent activity with custom params."""
        response = authenticated_client.get("/api/dashboard/recent-activity/?hours=48&limit=10")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_online_users_requires_authentication(self, api_client):
        """Test that online users endpoint requires authentication."""
        response = api_client.get("/api/dashboard/online-users/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_online_users_with_authentication(self, authenticated_client):
        """Test that authenticated users can access online users."""
        response = authenticated_client.get("/api/dashboard/online-users/")
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_content_creation_requires_authentication(self, api_client):
        """Test that content creation endpoint requires authentication."""
        response = api_client.get("/api/dashboard/content-creation/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_content_creation_with_authentication(self, authenticated_client):
        """Test that authenticated users can access content creation stats."""
        response = authenticated_client.get("/api/dashboard/content-creation/")
        assert response.status_code == status.HTTP_200_OK
        assert "gamedays_published" in response.data
        assert "avg_games_per_gameday" in response.data
        assert "top_publishers" in response.data
        assert "new_players" in response.data
        assert "transfers" in response.data
        assert "players_left" in response.data
        assert "top_teams_roster" in response.data
        assert "verifications" in response.data

    def test_feature_usage_requires_authentication(self, api_client):
        """Test that feature usage endpoint requires authentication."""
        response = api_client.get("/api/dashboard/feature-usage/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_feature_usage_with_authentication(self, authenticated_client):
        """Test that authenticated users can access feature usage stats."""
        response = authenticated_client.get("/api/dashboard/feature-usage/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_games" in response.data
        assert "scorecard_adoption" in response.data
        assert "scorecard_games" in response.data
        assert "scorecard_events" in response.data
        assert "scorecard_avg_events" in response.data
        assert "liveticker_adoption" in response.data
        assert "liveticker_games" in response.data
        assert "passcheck_verifications" in response.data
        assert "passcheck_teams" in response.data

    def test_user_segments_requires_authentication(self, api_client):
        """Test that user segments endpoint requires authentication."""
        response = api_client.get("/api/dashboard/user-segments/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_user_segments_with_authentication(self, authenticated_client):
        """Test that authenticated users can access user segments."""
        response = authenticated_client.get("/api/dashboard/user-segments/")
        assert response.status_code == status.HTTP_200_OK
        assert "team_managers" in response.data
        assert "officials" in response.data
        assert "players" in response.data
        assert "top_teams" in response.data

    def test_problem_alerts_requires_authentication(self, api_client):
        """Test that problem alerts endpoint requires authentication."""
        response = api_client.get("/api/dashboard/problem-alerts/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_problem_alerts_with_authentication(self, authenticated_client):
        """Test that authenticated users can access problem alerts."""
        response = authenticated_client.get("/api/dashboard/problem-alerts/")
        assert response.status_code == status.HTTP_200_OK
        assert "inactive_team_managers" in response.data
        assert "inactive_teams" in response.data
        assert "unused_accounts" in response.data

    def test_users_per_team_requires_authentication(self, api_client):
        """Test that users per team endpoint requires authentication."""
        response = api_client.get("/api/dashboard/users-per-team/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_users_per_team_with_authentication(self, authenticated_client):
        """Test that authenticated users can access users per team data."""
        response = authenticated_client.get("/api/dashboard/users-per-team/")
        assert response.status_code == status.HTTP_200_OK
        assert "teams" in response.data
        assert "total_teams_with_users" in response.data
        assert "total_users_with_teams" in response.data
        assert "users_without_team" in response.data
