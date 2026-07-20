"""
Tests for GET /api/designer/config/ (ConfigView).
"""

import pytest
from django.test import override_settings
from rest_framework import status

from gamedays.models import UserProfile


@pytest.mark.django_db
class TestConfigView:
    """Test GET /api/designer/config/."""

    def test_anonymous_cannot_get_config(self, api_client):
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_is_staff_true_for_staff_user(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is True

    def test_is_staff_false_for_regular_user(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_staff"] is False

    @override_settings(MOCK_TEAMS=False)
    def test_mock_teams_reflects_settings_when_false(
        self, api_client, association_user
    ):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["mock_teams"] is False

    @override_settings(MOCK_TEAMS=True)
    def test_mock_teams_reflects_settings_when_true(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["mock_teams"] is True

    def test_username_matches_authenticated_user(self, api_client, association_user):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["username"] == association_user.username

    def test_avatar_url_is_none_when_user_has_no_profile(
        self, api_client, association_user
    ):
        api_client.force_authenticate(user=association_user)
        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] is None

    def test_avatar_url_is_none_when_profile_has_no_avatar_file(
        self, api_client, association_user
    ):
        UserProfile.objects.create(user=association_user)
        api_client.force_authenticate(user=association_user)

        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] is None

    def test_avatar_url_returns_file_url_when_avatar_is_set(
        self, api_client, association_user
    ):
        profile = UserProfile.objects.create(user=association_user)
        profile.avatar.name = "media/teammanager/avatars/test-avatar.png"
        profile.save()
        api_client.force_authenticate(user=association_user)

        response = api_client.get("/api/designer/config/")

        assert response.data["avatar_url"] == profile.avatar.url
