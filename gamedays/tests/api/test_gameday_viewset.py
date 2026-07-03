import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from gamedays.models import Gameday, Season, League
from django.contrib.auth.models import User
from datetime import date


class GamedayViewSetTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username="admin", password="password", email="admin@test.com"
        )
        self.client.force_authenticate(user=self.user)
        self.season = Season.objects.create(name="2026")
        self.league = League.objects.create(name="DFFL")
        self.gameday1 = Gameday.objects.create(
            name="Test Gameday 1",
            date=date(2026, 1, 18),
            start="10:00",
            season=self.season,
            league=self.league,
            status="DRAFT",
            author=self.user,
        )
        self.gameday2 = Gameday.objects.create(
            name="Another Gameday",
            date=date(2026, 1, 19),
            start="11:00",
            season=self.season,
            league=self.league,
            status="PUBLISHED",
            author=self.user,
        )

    def test_list_gamedays_plural(self):
        # This is what we want to support
        url = "/api/gamedays/"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # Check if it's paginated
        assert "results" in response.data
        assert len(response.data["results"]) == 2

    def test_search_gamedays(self):
        url = "/api/gamedays/?search=Another"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["name"] == "Another Gameday"

    def test_filter_season(self):
        url = "/api/gamedays/?search=season:2026"
        # The ViewSet uses queryset = Gameday.objects.all().order_by("-date")
        # gameday2 (Jan 19) comes before gameday1 (Jan 18)
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 2

    def test_filter_status(self):
        url = "/api/gamedays/?search=status:published"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["status"] == "PUBLISHED"

    def test_publish_gameday(self):
        url = f"/api/gamedays/{self.gameday1.id}/publish/"
        response = self.client.post(url)
        assert response.status_code == status.HTTP_200_OK
        self.gameday1.refresh_from_db()
        assert self.gameday1.status == "PUBLISHED"
        assert self.gameday1.published_at is not None

    def test_create_gameday(self):
        url = "/api/gamedays/"
        data = {
            "name": "New API Gameday",
            "date": "2026-05-01",
            "start": "09:00",
            "season": self.season.id,
            "league": self.league.id,
            "format": "6_2",
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert Gameday.objects.filter(name="New API Gameday").exists()

    def test_delete_draft_gameday_allowed(self):
        url = f"/api/gamedays/{self.gameday1.id}/"
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Gameday.objects.filter(id=self.gameday1.id).exists()

    def test_delete_published_gameday_blocked(self):
        # self.gameday2 is PUBLISHED
        url = f"/api/gamedays/{self.gameday2.id}/"
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Gameday.objects.filter(id=self.gameday2.id).exists()
        assert (
            response.data["detail"]
            == "Published gamedays cannot be deleted. Please unlock the gameday first."
        )

    def test_get_gameday_includes_resource_urls(self):
        from gamedays.models import ResourceUrl
        ResourceUrl.objects.create(
            gameday=self.gameday1, url="https://example.com/a", description="Livestream"
        )
        response = self.client.get(f"/api/gamedays/{self.gameday1.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["resource_urls"] == [
            {"id": self.gameday1.resourceurl_set.first().id,
             "url": "https://example.com/a",
             "description": "Livestream"}
        ]

    def test_patch_adds_resource_url(self):
        from gamedays.models import ResourceUrl
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"resource_urls": [{"url": "https://example.com/x", "description": "X"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        urls = ResourceUrl.objects.filter(gameday=self.gameday1)
        assert urls.count() == 1
        assert urls.first().url == "https://example.com/x"
        assert urls.first().description == "X"

    def test_patch_updates_existing_resource_url(self):
        from gamedays.models import ResourceUrl
        ru = ResourceUrl.objects.create(
            gameday=self.gameday1, url="https://example.com/old", description="Old"
        )
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"resource_urls": [
                {"id": ru.id, "url": "https://example.com/new", "description": "New"}
            ]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        ru.refresh_from_db()
        assert ru.url == "https://example.com/new"
        assert ru.description == "New"
        assert ResourceUrl.objects.filter(gameday=self.gameday1).count() == 1

    def test_patch_deletes_omitted_resource_url(self):
        from gamedays.models import ResourceUrl
        ru_keep = ResourceUrl.objects.create(
            gameday=self.gameday1, url="https://example.com/keep", description="Keep"
        )
        ResourceUrl.objects.create(
            gameday=self.gameday1, url="https://example.com/drop", description="Drop"
        )
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"resource_urls": [
                {"id": ru_keep.id, "url": ru_keep.url, "description": ru_keep.description}
            ]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        remaining = list(
            ResourceUrl.objects.filter(gameday=self.gameday1)
            .values_list("id", flat=True)
        )
        assert remaining == [ru_keep.id]

    def test_patch_invalid_url_returns_400(self):
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"resource_urls": [{"url": "not-a-url", "description": "Bad"}]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_patch_without_resource_urls_preserves_existing(self):
        from gamedays.models import ResourceUrl
        ResourceUrl.objects.create(
            gameday=self.gameday1, url="https://example.com/keep", description="Keep"
        )
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"name": self.gameday1.name},  # no resource_urls key
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert ResourceUrl.objects.filter(gameday=self.gameday1).count() == 1

    def test_patch_empty_description_returns_400(self):
        response = self.client.patch(
            f"/api/gamedays/{self.gameday1.id}/",
            {"resource_urls": [{"url": "https://example.com/x", "description": ""}]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
