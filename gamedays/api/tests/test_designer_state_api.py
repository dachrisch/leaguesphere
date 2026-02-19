"""
Tests for GamedayDesignerState API integration.

Tests the reading of designer_data from the new GamedayDesignerState model
through the GamedaySerializer API.
"""

from django.contrib.auth.models import User
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
            "globalTeams": [{"id": "t1", "name": "Team A"}],
        }

        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        # Act
        url = f"/api/gamedays/{gameday.pk}/"
        response = self.app.get(url, headers=self.db_setup.get_token_header())

        # Assert
        assert response.status_code == HTTPStatus.OK
        assert response.json["designer_data"] == state_data

    def test_read_designer_data_when_none_exists(self):
        """Test reading designer_data returns None when no state exists."""
        # Arrange
        gameday = GamedayFactory.create()

        # Act
        url = f"/api/gamedays/{gameday.pk}/"
        response = self.app.get(url, headers=self.db_setup.get_token_header())

        # Assert
        assert response.status_code == HTTPStatus.OK
        assert response.json["designer_data"] is None

    def test_update_designer_data_creates_new_model(self):
        """Test PATCH creates GamedayDesignerState when it doesn't exist."""
        # Arrange
        gameday = GamedayFactory.create()
        user = User.objects.first()  # Get the user created by the factory
        state_data = {
            "nodes": [{"id": "3", "type": "field"}],
            "edges": [],
            "globalTeams": [{"id": "t2", "name": "Team B"}],
        }

        # Act
        url = f"/api/gamedays/{gameday.pk}/"
        response = self.app.patch_json(
            url, {"designer_data": state_data}, headers=self.db_setup.get_token_header()
        )

        # Assert
        assert response.status_code == HTTPStatus.OK

        # Verify new model was created
        gameday.refresh_from_db()
        assert hasattr(gameday, "designer_state")
        assert gameday.designer_state.state_data == state_data
        assert gameday.designer_state.last_modified_by == user

    def test_update_designer_data_updates_existing_model(self):
        """Test PATCH updates existing GamedayDesignerState."""
        # Arrange
        gameday = GamedayFactory.create()
        user = User.objects.first()  # Get the user created by the factory
        initial_data = {"nodes": [{"id": "4"}], "edges": [], "globalTeams": []}
        updated_data = {"nodes": [{"id": "5"}], "edges": [], "globalTeams": []}

        # Create initial state
        GamedayDesignerState.objects.create(gameday=gameday, state_data=initial_data)

        # Act
        url = f"/api/gamedays/{gameday.pk}/"
        response = self.app.patch_json(
            url,
            {"designer_data": updated_data},
            headers=self.db_setup.get_token_header(),
        )

        # Assert
        assert response.status_code == HTTPStatus.OK

        # Verify model was updated
        gameday.refresh_from_db()
        gameday.designer_state.refresh_from_db()
        assert gameday.designer_state.state_data == updated_data
        assert gameday.designer_state.last_modified_by == user

    def test_update_designer_data_with_none_does_nothing(self):
        """Test PATCH without designer_data doesn't create model."""
        # Arrange
        gameday = GamedayFactory.create()

        # Act
        url = f"/api/gamedays/{gameday.pk}/"
        response = self.app.patch_json(
            url, {"name": "Updated Name"}, headers=self.db_setup.get_token_header()
        )

        # Assert
        assert response.status_code == HTTPStatus.OK

        # Verify no model was created
        gameday.refresh_from_db()
        assert not hasattr(gameday, "designer_state")

    def test_publish_reads_from_new_model(self):
        """Test publish action reads designer_data from new model."""
        # Arrange
        from gamedays.models import Gameday

        gameday = GamedayFactory.create(status=Gameday.STATUS_DRAFT)

        # Ensure old field is None/empty to prove we're reading from new model
        gameday.designer_data = None
        gameday.save()

        state_data = {
            "nodes": [{"id": "game1", "type": "game", "data": {"label": "Game 1"}}],
            "edges": [],
            "globalTeams": [],
        }

        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        # Act
        url = f"/api/gamedays/{gameday.pk}/publish/"
        response = self.app.post(url, headers=self.db_setup.get_token_header())

        # Assert - Should succeed (not 400 error about missing designer state)
        assert response.status_code in [HTTPStatus.OK, HTTPStatus.CREATED]

    def test_publish_fails_when_no_designer_data(self):
        """Test publish action fails when no designer_data exists."""
        # Arrange
        from gamedays.models import Gameday

        gameday = GamedayFactory.create(status=Gameday.STATUS_DRAFT)

        # Act
        url = f"/api/gamedays/{gameday.pk}/publish/"
        response = self.app.post(
            url, headers=self.db_setup.get_token_header(), expect_errors=True
        )

        # Assert
        assert response.status_code == HTTPStatus.BAD_REQUEST
        assert "No designer state found" in response.json["detail"]
