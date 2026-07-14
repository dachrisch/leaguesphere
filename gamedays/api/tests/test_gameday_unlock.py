import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    Team,
    Season,
    League,
)


@pytest.mark.django_db
class TestUnlockGuard:
    """Unlocking (PUBLISHED -> DRAFT) is the step that enables a destructive
    re-publish. It must be refused when the gameday already has entered results."""

    def setup_method(self):
        self.user = User.objects.create_superuser("unlock_test", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        season = Season.objects.create(name="2026")
        league = League.objects.create(name="Test League")
        self.gameday = Gameday.objects.create(
            name="Test Day",
            season=season,
            league=league,
            date="2026-03-15",
            start="10:00",
            status=Gameday.STATUS_PUBLISHED,
            author=self.user,
        )
        self.team = Team.objects.create(
            name="Alpha", description="Alpha desc", location="X"
        )
        self.gi = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.team,
            stage="Vorrunde",
            standing="Gruppe 1",
        )

    def _unlock(self):
        return self.client.patch(
            f"/api/gamedays/{self.gameday.id}/", {"status": "DRAFT"}, format="json"
        )

    def test_unlock_blocked_when_results_entered(self):
        Gameresult.objects.create(
            gameinfo=self.gi, team=self.team, fh=3, sh=4, isHome=True
        )
        resp = self._unlock()
        assert resp.status_code == 409
        self.gameday.refresh_from_db()
        assert self.gameday.status == Gameday.STATUS_PUBLISHED

    def test_unlock_allowed_when_no_results(self):
        # scoreless placeholder result — nothing worth protecting
        Gameresult.objects.create(gameinfo=self.gi, team=self.team, isHome=True)
        resp = self._unlock()
        assert resp.status_code == 200
        self.gameday.refresh_from_db()
        assert self.gameday.status == Gameday.STATUS_DRAFT
