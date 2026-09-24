from django.test import TestCase

from gamedays.models import Gameinfo, GamedayDesignerState
from gamedays.service.canvas_publish_service import CanvasPublishService
from gamedays.service.stage_category import StageCategory
from gamedays.tests.setup_factories.db_setup import DBSetup


def _state_data_with_one_game(stage_category="preliminary"):
    return {
        "nodes": [
            {
                "id": "field-1",
                "type": "field",
                "data": {"type": "field", "name": "Feld 1", "order": 0},
            },
            {
                "id": "stage-1",
                "type": "stage",
                "parentId": "field-1",
                "data": {
                    "type": "stage",
                    "name": "Liga",
                    "category": stage_category,
                    "stageType": "STANDARD",
                },
            },
            {
                "id": "game-1",
                "type": "game",
                "parentId": "stage-1",
                "data": {
                    "type": "game",
                    "standing": "Tabelle",
                    "startTime": "10:00",
                    "homeTeamId": None,
                    "awayTeamId": None,
                    "official": None,
                },
            },
        ],
        "globalTeams": [],
    }


class TestCanvasPublishServiceStageCategory(TestCase):
    def test_apply_persists_preliminary_category_from_stage_node(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_one_game("preliminary")
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage == "Liga"
        assert gi.stage_category == StageCategory.PRELIMINARY

    def test_apply_persists_final_category_from_stage_node(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_one_game("final")
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage_category == StageCategory.FINAL

    def test_apply_defaults_to_preliminary_when_stage_node_has_no_category(self):
        state_data = _state_data_with_one_game("preliminary")
        del state_data["nodes"][1]["data"]["category"]
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.stage_category == StageCategory.PRELIMINARY


def _state_data_with_multi_field_stage():
    """A single 'Platzierung' stage spanning fields 1 and 2, with one game on
    each -- the shape that lets one field-agnostic standings table cover
    games physically played on different fields."""
    return {
        "nodes": [
            {
                "id": "field-1",
                "type": "field",
                "data": {"type": "field", "name": "Feld 1", "order": 0},
            },
            {
                "id": "field-2",
                "type": "field",
                "data": {"type": "field", "name": "Feld 2", "order": 1},
            },
            {
                "id": "stage-1",
                "type": "stage",
                "parentId": "field-1",
                "data": {
                    "type": "stage",
                    "name": "Platzierung",
                    "category": "preliminary",
                    "stageType": "RANKING",
                    "fieldIds": ["field-1", "field-2"],
                },
            },
            {
                "id": "game-on-home-field",
                "type": "game",
                "parentId": "stage-1",
                "data": {
                    "type": "game",
                    "standing": "Spiel 1",
                    "startTime": "10:00",
                    "homeTeamId": None,
                    "awayTeamId": None,
                    "official": None,
                },
            },
            {
                "id": "game-on-second-field",
                "type": "game",
                "parentId": "stage-1",
                "data": {
                    "type": "game",
                    "standing": "Spiel 2",
                    "startTime": "10:00",
                    "fieldId": "field-2",
                    "homeTeamId": None,
                    "awayTeamId": None,
                    "official": None,
                },
            },
        ],
        "globalTeams": [],
    }


class TestCanvasPublishServiceMultiFieldStage(TestCase):
    def test_game_without_field_override_uses_stage_home_field(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_multi_field_stage()
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday, standing="Spiel 1")
        assert gi.field == 1
        assert gi.stage == "Platzierung"

    def test_game_with_field_override_uses_its_own_field(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_multi_field_stage()
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday, standing="Spiel 2")
        assert gi.field == 2
        # both games still share the stage's name for standings purposes
        assert gi.stage == "Platzierung"


class TestCanvasPublishServiceDayOffset(TestCase):
    def test_apply_persists_day_offset_from_game_node(self):
        state_data = _state_data_with_one_game()
        state_data["nodes"][2]["data"]["dayOffset"] = 1
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.day_offset == 1

    def test_apply_defaults_day_offset_to_zero_when_not_set(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data=_state_data_with_one_game()
        )

        CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.day_offset == 0
