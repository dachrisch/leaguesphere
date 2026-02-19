"""
Tests for GamedayDesignerState API integration.

Tests the reading of designer_data from the new GamedayDesignerState model
through the GamedaySerializer API.
"""

from django_webtest import WebTest
from http import HTTPStatus

from gamedays.models import GamedayDesignerState
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GamedayFactory


class GamedayDesignerStateAPITests(WebTest):
    """Test reading designer_data from new GamedayDesignerState model via API."""

    def setUp(self):
        """Set up test environment."""
        self.db_setup = DBSetup()

    def test_read_designer_data_from_new_model(self):
        """Test reading designer_data from new GamedayDesignerState model."""
        # Arrange
        gameday = GamedayFactory.create()

        state_data = {
            "nodes": [{"id": "1", "type": "game"}],
            "edges": [{"id": "e1", "source": "1", "target": "2"}],
            "globalTeams": [{"id": "t1", "name": "Team A"}]
        }

        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data=state_data
        )

        # Act
        url = f'/api/gamedays/{gameday.pk}/'
        response = self.app.get(url, headers=self.db_setup.get_token_header())

        # Assert
        assert response.status_code == HTTPStatus.OK
        assert response.json['designer_data'] == state_data

    def test_read_designer_data_when_none_exists(self):
        """Test reading designer_data returns None when no state exists."""
        # Arrange
        gameday = GamedayFactory.create()

        # Act
        url = f'/api/gamedays/{gameday.pk}/'
        response = self.app.get(url, headers=self.db_setup.get_token_header())

        # Assert
        assert response.status_code == HTTPStatus.OK
        assert response.json['designer_data'] is None
