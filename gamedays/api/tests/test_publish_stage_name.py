
from django.contrib.auth.models import User
from django_webtest import WebTest
from http import HTTPStatus

from gamedays.models import GamedayDesignerState, Gameinfo, Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GamedayFactory


class GamedayPublishStageNameTests(WebTest):
    """Test stage name resolution during gameday publication."""

    def setUp(self):
        """Set up test environment."""
        self.db_setup = DBSetup()

    def test_publish_uses_actual_stage_name_from_designer(self):
        """Test that publication uses the name from the stage node even if fieldId is set."""
        # Arrange
        gameday = GamedayFactory.create(status=Gameday.STATUS_DRAFT)
        
        # Design: Field 1 -> Stage "Custom Stage Name" -> Game
        field_id = "field-1"
        stage_id = "stage-1"
        game_id = "game-1"
        
        state_data = {
            "nodes": [
                {
                    "id": field_id, 
                    "type": "field", 
                    "data": {"name": "Feld 1", "order": 0}
                },
                {
                    "id": stage_id, 
                    "type": "stage", 
                    "parentId": field_id,
                    "data": {"name": "Custom Stage Name", "order": 0}
                },
                {
                    "id": game_id, 
                    "type": "game", 
                    "parentId": stage_id,
                    "data": {
                        "standing": "Game 1",
                        "fieldId": field_id,  # This trigger the bug
                        "stage": "Preliminary" # The legacy/default value
                    }
                }
            ],
            "edges": [],
            "globalTeams": [],
        }

        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        # Act
        url = f"/api/gamedays/{gameday.pk}/publish/"
        response = self.app.post(url, headers=self.db_setup.get_token_header())

        # Assert
        assert response.status_code == HTTPStatus.OK
        
        gameinfo = Gameinfo.objects.filter(gameday=gameday).first()
        assert gameinfo.stage == "Custom Stage Name", f"Expected 'Custom Stage Name', but got '{gameinfo.stage}'"
