from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from gamedays.models import Gameinfo
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
)


def make_gameday_with_game():
    """One gameday with one game (home+away results)."""
    gameday = GamedayFactory()
    game = GameinfoFactory(gameday=gameday)
    GameresultFactory(gameinfo=game, isHome=True, fh=1, sh=2)
    GameresultFactory(gameinfo=game, isHome=False, fh=3, sh=4)
    return gameday


class GamedayGamesEtagFreshnessTest(APITestCase):
    """In-place score/status edits must change the games endpoint's ETag.

    Otherwise a client polling with If-None-Match gets a stale 304 and keeps
    showing outdated scores while the gameday runs.
    """

    def setUp(self):
        self.user = User.objects.create_superuser(username="admin", password="pw")
        self.client.force_authenticate(user=self.user)

    def test_games_etag_changes_when_result_score_changes(self):
        gameday = make_gameday_with_game()
        url = f"/api/gamedays/{gameday.pk}/games/"

        first = self.client.get(url)
        assert first.status_code == status.HTTP_200_OK
        etag_before = first["ETag"]

        result = gameday.gameinfo_set.get().gameresult_set.get(isHome=True)
        result.fh = (result.fh or 0) + 5
        result.save()

        revalidated = self.client.get(url, HTTP_IF_NONE_MATCH=etag_before)
        assert revalidated.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a game whose score just "
            "changed -- the client will keep rendering the stale cached body"
        )
        assert revalidated["ETag"] != etag_before

    def test_games_etag_changes_when_gameinfo_status_changes(self):
        gameday = make_gameday_with_game()
        url = f"/api/gamedays/{gameday.pk}/games/"

        first = self.client.get(url)
        assert first.status_code == status.HTTP_200_OK
        etag_before = first["ETag"]

        game = gameday.gameinfo_set.get()
        game.status = Gameinfo.STATUS_COMPLETED
        game.save()

        revalidated = self.client.get(url, HTTP_IF_NONE_MATCH=etag_before)
        assert revalidated.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a game whose status just "
            "changed -- the client will keep rendering the stale cached body"
        )
        assert revalidated["ETag"] != etag_before

    def test_games_etag_changes_when_score_entered_via_api(self):
        """Lock the invariant through the production write path:
        GameResultUpdateAPIView.patch writes scores via queryset .update()
        (no save(), no signals) plus game.save() -- the etag must flip.
        """
        gameday = make_gameday_with_game()
        game = gameday.gameinfo_set.get()
        url = f"/api/gamedays/{gameday.pk}/games/"

        first = self.client.get(url)
        assert first.status_code == status.HTTP_200_OK
        etag_before = first["ETag"]

        patched = self.client.patch(
            f"/api/gamedays/gameinfo/{game.pk}/result/",
            {"final_score": {"home": 7, "away": 6}},
            format="json",
        )
        assert patched.status_code == status.HTTP_200_OK

        revalidated = self.client.get(url, HTTP_IF_NONE_MATCH=etag_before)
        assert revalidated.status_code == status.HTTP_200_OK, (
            "server returned 304 Not Modified for a game whose score was just "
            "entered via the API -- the client will keep rendering the stale "
            "cached body"
        )
        assert revalidated["ETag"] != etag_before

    def test_games_etag_revalidates_with_304_when_unchanged(self):
        gameday = make_gameday_with_game()
        url = f"/api/gamedays/{gameday.pk}/games/"

        first = self.client.get(url)
        assert first.status_code == status.HTTP_200_OK

        revalidated = self.client.get(url, HTTP_IF_NONE_MATCH=first["ETag"])
        assert revalidated.status_code == status.HTTP_304_NOT_MODIFIED

    def test_games_for_missing_gameday_returns_404(self):
        response = self.client.get("/api/gamedays/999999/games/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
