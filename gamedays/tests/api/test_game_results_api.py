import pytest
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from gamedays.models import Gameday, Gameinfo, Gameresult, Team, Season, League
from datetime import date


class GameResultsAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username="admin", password="password", email="admin@test.com"
        )
        self.client.force_authenticate(user=self.user)

        self.season = Season.objects.create(name="2026")
        self.league = League.objects.create(name="Test")

        self.team_a = Team.objects.create(
            name="Team A", description="Desc A", location="City"
        )
        self.team_b = Team.objects.create(
            name="Team B", description="Desc B", location="City"
        )

        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            season=self.season,
            league=self.league,
            date=date(2026, 2, 3),
            start="10:00",
            author=self.user,
            status="PUBLISHED",
        )

        self.gameinfo = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.team_a,
            stage="Group",
            standing="Final",
        )

        Gameresult.objects.create(gameinfo=self.gameinfo, team=self.team_a, isHome=True)
        Gameresult.objects.create(
            gameinfo=self.gameinfo, team=self.team_b, isHome=False
        )

    def test_get_gameday_results(self):
        """Test retrieving all games for a gameday"""
        url = f"/api/gamedays/{self.gameday.id}/games/"
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["field"] == 1

    def test_update_game_result(self):
        """Test updating scores for a game"""
        url = f"/api/gamedays/{self.gameday.id}/games/{self.gameinfo.id}/results/"
        data = {
            "results": [
                {"team_id": self.team_a.id, "fh": 2, "sh": 1, "isHome": True},
                {"team_id": self.team_b.id, "fh": 1, "sh": 0, "isHome": False},
            ]
        }
        response = self.client.post(url, data, format="json")
        assert response.status_code == status.HTTP_200_OK

        # Verify saved
        self.gameinfo.refresh_from_db()
        home_result = Gameresult.objects.get(gameinfo=self.gameinfo, isHome=True)
        assert home_result.fh == 2
        assert home_result.sh == 1

    def test_cannot_update_locked_game(self):
        """Test that locked games cannot be updated"""
        self.gameinfo.is_locked = True
        self.gameinfo.save()

        url = f"/api/gamedays/{self.gameday.id}/games/{self.gameinfo.id}/results/"
        data = {
            "results": [
                {"team_id": self.team_a.id, "fh": 2, "sh": 1, "isHome": True},
            ]
        }
        response = self.client.post(url, data, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
