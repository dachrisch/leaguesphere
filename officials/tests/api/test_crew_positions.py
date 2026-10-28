from http import HTTPStatus

from django_webtest import WebTest
from rest_framework.reverse import reverse

from gamedays.models import Gameinfo, Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup
from officials.api.urls import API_CREW_POSITIONS_FOR_GAME
from officials.models import CrewPosition
from officials.service.crew_positions import DEFAULT_CREW_POSITIONS


class TestCrewPositionsForGameAPIView(WebTest):
    def setUp(self):
        self.gameday: Gameday = DBSetup().g62_status_empty()
        self.game: Gameinfo = Gameinfo.objects.first()
        self.url = reverse(
            API_CREW_POSITIONS_FOR_GAME, kwargs={"pk": self.game.pk}
        )

    def test_unauthenticated_request_is_rejected(self):
        response = self.app.get(self.url, expect_errors=True)

        # knox answers 401 before permission classes see the request.
        assert response.status_code == HTTPStatus.UNAUTHORIZED

    def test_a_league_without_configuration_answers_the_default_slots(self):
        response = self.app.get(self.url, headers=DBSetup().get_token_header())

        assert response.status_code == HTTPStatus.OK
        assert response.json == DEFAULT_CREW_POSITIONS

    def test_a_configured_league_answers_its_slots_in_order(self):
        CrewPosition.objects.create(
            league=self.gameday.league,
            position="Referee",
            label="Head Referee",
            order=2,
            required=True,
        )
        CrewPosition.objects.create(
            league=self.gameday.league,
            position="Scorekeeper",
            label="Protokoll",
            order=1,
            required=False,
        )

        response = self.app.get(self.url, headers=DBSetup().get_token_header())

        assert response.status_code == HTTPStatus.OK
        assert response.json == [
            {
                "position": "Scorekeeper",
                "label": "Protokoll",
                "order": 1,
                "required": False,
            },
            {
                "position": "Referee",
                "label": "Head Referee",
                "order": 2,
                "required": True,
            },
        ]

    def test_an_unknown_game_answers_not_found(self):
        response = self.app.get(
            reverse(API_CREW_POSITIONS_FOR_GAME, kwargs={"pk": self.game.pk + 999}),
            expect_errors=True,
            headers=DBSetup().get_token_header(),
        )

        assert response.status_code == HTTPStatus.NOT_FOUND
