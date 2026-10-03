from gamedays.service.canvas_progression_validation_service import (
    CanvasProgressionValidator,
)


def _stage_node(node_id, field_id, name, category="preliminary", stage_type="STANDARD"):
    return {
        "id": node_id,
        "type": "stage",
        "parentId": field_id,
        "data": {
            "type": "stage",
            "name": name,
            "category": category,
            "stageType": stage_type,
        },
    }


def _game_node(node_id, stage_id, standing, **overrides):
    data = {
        "type": "game",
        "standing": standing,
        "startTime": "10:00",
        "homeTeamId": None,
        "awayTeamId": None,
        "homeTeamDynamic": None,
        "awayTeamDynamic": None,
        "official": None,
    }
    data.update(overrides)
    return {"id": node_id, "type": "game", "parentId": stage_id, "data": data}


def _edge(source, source_handle, target, target_handle):
    return {
        "id": f"{source}-{target}",
        "type": "gameToGame",
        "source": source,
        "sourceHandle": source_handle,
        "target": target,
        "targetHandle": target_handle,
    }


def _codes(issues):
    return {issue.code for issue in issues}


class TestCanvasProgressionValidator:
    def _base_nodes(self, **game_overrides):
        return [
            {"id": "field-1", "type": "field", "parentId": None, "data": {"type": "field", "name": "F1", "order": 0}},
            _stage_node("stage-semi", "field-1", "Halbfinale", "final"),
            _stage_node("stage-final", "field-1", "Finale", "final"),
            _game_node("hf1", "stage-semi", "1.-4."),
            _game_node("hf2", "stage-semi", "1.-4."),
            _game_node("final", "stage-final", "1.-2.", **game_overrides),
        ]

    def test_edge_wired_duplicate_standings_is_valid(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "winner", "matchName": "HF1 1.-4."},
                awayTeamDynamic={"type": "winner", "matchName": "HF2 1.-4."},
            ),
            "edges": [
                _edge("hf1", "winner", "final", "home"),
                _edge("hf2", "winner", "final", "away"),
            ],
        }
        assert CanvasProgressionValidator(state).validate() == []

    def test_dangling_matchName_without_edge_is_reported(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "winner", "matchName": "HF1 1.-4."},
            ),
            "edges": [],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "dangling_reference" in _codes(issues)

    def test_ambiguous_matchName_without_edge_is_reported(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "winner", "matchName": "1.-4."},
            ),
            "edges": [],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "ambiguous_reference" in _codes(issues)

    def test_edge_pointing_at_missing_source_is_reported(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "winner", "matchName": "HF1 1.-4."},
            ),
            "edges": [_edge("ghost", "winner", "final", "home")],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "dangling_reference" in _codes(issues)

    def test_self_reference_is_reported(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "winner", "matchName": "final"},
            ),
            "edges": [_edge("final", "winner", "final", "home")],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "self_reference" in _codes(issues)

    def test_cycle_is_reported(self):
        nodes = [
            {"id": "field-1", "type": "field", "parentId": None, "data": {"type": "field", "name": "F1", "order": 0}},
            _stage_node("stage-1", "field-1", "Vorrunde"),
            _game_node("a", "stage-1", "A", homeTeamDynamic={"type": "winner", "matchName": "B"}),
            _game_node("b", "stage-1", "B", homeTeamDynamic={"type": "winner", "matchName": "A"}),
        ]
        state = {"nodes": nodes, "edges": []}
        issues = CanvasProgressionValidator(state).validate()
        assert "unresolved_cycle" in _codes(issues)

    def test_rank_reference_to_missing_stage_is_reported(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={"type": "rank", "stageName": "Nope", "place": 1},
            ),
            "edges": [],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "missing_stage" in _codes(issues)

    def test_valid_rank_reference_passes(self):
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={
                    "type": "rank",
                    "stageId": "stage-semi",
                    "stageName": "Halbfinale",
                    "place": 1,
                },
            ),
            "edges": [],
        }
        assert CanvasProgressionValidator(state).validate() == []

    def test_rank_place_above_stage_size_is_reported(self):
        # stage-semi holds two games with dynamic teams -> size unknown; two
        # games means at most four starters, so place 99 is certainly invalid.
        state = {
            "nodes": self._base_nodes(
                homeTeamDynamic={
                    "type": "rank",
                    "stageId": "stage-semi",
                    "stageName": "Halbfinale",
                    "place": 99,
                },
            ),
            "edges": [],
        }
        issues = CanvasProgressionValidator(state).validate()
        assert "rank_out_of_range" in _codes(issues)
