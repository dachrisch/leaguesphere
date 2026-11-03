"""``GET /api/game/<id>/summary`` backs the scorecard's deep link.

The field app is one page and normally reaches a game through its gameday, so
a link that names the game directly needs the row the games list would show
*and* the gameday it belongs to. The row is built through the same service as
the list, so a link cannot show a different game than the list does.
"""

from http import HTTPStatus
from unittest.mock import patch

import pandas as pd
from django_webtest import WebTest
from rest_framework.reverse import reverse

from gamedays.models import Gameinfo, Gameresult
from gamedays.tests.setup_factories.db_setup import DBSetup
from passcheck.models import PasscheckVerification

SUMMARY_URL = "api-game-summary"


class TestGameSummary(WebTest):
    def setUp(self):
        self.gameday = DBSetup().g62_status_empty()
        self.game = Gameinfo.objects.filter(gameday=self.gameday).first()

    def _summary(self, game_id=None):
        return self.app.get(
            reverse(SUMMARY_URL, kwargs={"pk": game_id or self.game.pk}),
            headers=DBSetup().get_token_header(),
            expect_errors=True,
        )

    def test_returns_the_games_list_row_and_its_gameday(self):
        response = self._summary()

        assert response.status_code == HTTPStatus.OK
        body = response.json
        assert body["game"]["id"] == self.game.pk
        assert body["game"]["field"] == self.game.field
        assert body["game"]["stage"] == self.game.stage
        assert body["gameday"]["id"] == self.gameday.pk
        assert body["gameday"]["name"] == self.gameday.name
        assert body["gameday"]["league_display"] == self.gameday.league.name

    def test_row_carries_the_passcheck_state_like_the_list(self):
        for result in Gameresult.objects.filter(gameinfo=self.game):
            PasscheckVerification.objects.create(
                gameday=self.gameday,
                team=result.team,
                official_name="Kontrolle",
                user=self.gameday.author,
            )

        assert self._summary().json["game"]["passcheck"] is True

    def test_a_game_the_list_does_not_contain_is_a_404(self):
        """The row comes from the gameday's list; a mismatch must not answer
        with somebody else's game."""

        with patch("gamedays.api.game_views.GamedayService.create") as create:
            create.return_value.get_games_to_whistle.return_value = pd.DataFrame(
                [{"id": -1}]
            )
            response = self._summary()

        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_unknown_game_is_a_404(self):
        response = self._summary(game_id=999_999)

        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_requires_a_login(self):
        response = self.app.get(
            reverse(SUMMARY_URL, kwargs={"pk": self.game.pk}),
            expect_errors=True,
        )

        assert response.status_code in (
            HTTPStatus.UNAUTHORIZED,
            HTTPStatus.FORBIDDEN,
        )
