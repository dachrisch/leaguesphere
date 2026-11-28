"""Characterization tests for sync_canvas_node_scores (moved from
gamedays/api/views.py::_sync_designer_node_scores in N3)."""

from django.test import TestCase

from gamedays.models import GamedayDesignerState, Gameinfo, Team
from gamedays.tests.setup_factories.db_setup import DBSetup
from gameday_designer.service.canvas_scores import sync_canvas_node_scores


class TestSyncCanvasNodeScores(TestCase):
    def setUp(self):
        self.gameday = DBSetup().create_empty_gameday()
        self.officials = Team.objects.create(name="Off", description="Off")

    def _game(self, designer_node_id="game-1"):
        return Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.officials,
            stage="Vorrunde",
            standing="G1",
            designer_node_id=designer_node_id,
        )

    def _state(self, state_data):
        return GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data=state_data
        )

    def test_game_without_designer_node_id_is_skipped_without_queries(self):
        game = self._game(designer_node_id="")
        with self.assertNumQueries(0):
            sync_canvas_node_scores(game, {"home": 1, "away": 0}, None)

    def test_missing_designer_state_is_a_noop(self):
        game = self._game()
        with self.assertNumQueries(1):
            sync_canvas_node_scores(game, {"home": 1, "away": 0}, None)
        assert not GamedayDesignerState.objects.filter(gameday=self.gameday).exists()

    def test_state_without_node_list_is_left_untouched(self):
        game = self._game()
        state = self._state({"nodes": {"not": "a list"}})
        with self.assertNumQueries(1):
            sync_canvas_node_scores(game, {"home": 1, "away": 0}, None)
        state.refresh_from_db()
        assert state.state_data == {"nodes": {"not": "a list"}}

    def test_empty_state_data_counts_as_no_nodes(self):
        game = self._game()
        state = self._state({})
        with self.assertNumQueries(1):
            sync_canvas_node_scores(game, {"home": 1, "away": 0}, None)
        state.refresh_from_db()
        assert state.state_data == {}

    def test_no_matching_node_saves_nothing(self):
        game = self._game()
        nodes = [{"id": "other", "data": {"standing": "X"}}]
        state = self._state({"nodes": nodes})
        with self.assertNumQueries(1):
            sync_canvas_node_scores(game, {"home": 1, "away": 0}, {"home": 2})
        state.refresh_from_db()
        assert state.state_data == {"nodes": nodes}

    def test_both_scores_written_to_matching_node_only(self):
        game = self._game()
        state = self._state(
            {
                "nodes": [
                    {"id": "other", "data": {"standing": "X"}},
                    {"id": "game-1", "data": {"standing": "G1"}},
                ],
                "edges": [],
            }
        )
        with self.assertNumQueries(2):
            sync_canvas_node_scores(
                game, {"home": 1, "away": 0}, {"home": 3, "away": 2}
            )
        state.refresh_from_db()
        assert state.state_data["nodes"][0] == {
            "id": "other",
            "data": {"standing": "X"},
        }
        assert state.state_data["nodes"][1]["data"] == {
            "standing": "G1",
            "halftime_score": {"home": 1, "away": 0},
            "final_score": {"home": 3, "away": 2},
        }
        assert state.state_data["edges"] == []

    def test_none_scores_keep_existing_values_and_missing_data_is_created(self):
        game = self._game()
        state = self._state({"nodes": [{"id": "game-1"}]})
        with self.assertNumQueries(2):
            sync_canvas_node_scores(game, None, None)
        state.refresh_from_db()
        assert state.state_data["nodes"][0] == {"id": "game-1", "data": {}}

    def test_only_final_score_overwrites_final_and_keeps_halftime(self):
        game = self._game()
        state = self._state(
            {
                "nodes": [
                    {
                        "id": "game-1",
                        "data": {
                            "halftime_score": {"home": 0, "away": 0},
                            "final_score": {"home": 1, "away": 1},
                        },
                    }
                ]
            }
        )
        with self.assertNumQueries(2):
            sync_canvas_node_scores(game, None, {"home": 7, "away": 0})
        state.refresh_from_db()
        assert state.state_data["nodes"][0]["data"] == {
            "halftime_score": {"home": 0, "away": 0},
            "final_score": {"home": 7, "away": 0},
        }
