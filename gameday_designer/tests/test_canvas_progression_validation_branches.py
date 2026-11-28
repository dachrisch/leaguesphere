"""Branch characterization for CanvasProgressionValidator (moved, N3)."""

from gameday_designer.service.canvas_progression_validation_service import (
    CanvasProgressionValidator,
)
from gameday_designer.tests.test_canvas_progression_validation_service import (
    _game_node,
    _stage_node,
)


def _field():
    return {"id": "field-1", "type": "field", "parentId": None, "data": {}}


def _validate(nodes, edges=None):
    validator = CanvasProgressionValidator({"nodes": nodes, "edges": edges or []})
    return validator, validator.validate()


class TestValidatorNodeShapes:
    def test_game_without_standing_or_parent_is_valid(self):
        _, issues = _validate([{"id": "g-bare", "type": "game", "data": {}}])
        assert issues == []

    def test_game_without_id_is_skipped_but_still_feeds_standing_index(self):
        """A game node without id is never validated itself, but its standing
        still resolves a matchName ref; the recorded source id is then None
        and contributes no cycle edge."""
        validator, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                {"type": "game", "parentId": "stage-1", "data": {"standing": "S"}},
                _game_node(
                    "g2",
                    "stage-1",
                    "Final",
                    homeTeamDynamic={"type": "winner", "matchName": "S"},
                ),
            ]
        )
        assert issues == []
        assert validator._game_source == {("g2", "home"): None}

    def test_null_state_data_is_valid(self):
        assert CanvasProgressionValidator(None).validate() == []


class TestValidatorReferenceKinds:
    def test_non_progression_ref_type_is_ignored(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "g1",
                    "stage-1",
                    "G1",
                    homeTeamDynamic={"type": "standing", "place": 1},
                    awayTeamDynamic={"type": "groupTeam", "group": "A", "team": 1},
                ),
            ]
        )
        assert issues == []

    def test_official_winner_ref_resolves_by_match_name(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node("g1", "stage-1", "G1"),
                _game_node(
                    "g2",
                    "stage-1",
                    "G2",
                    official={"type": "winner", "matchName": "G1"},
                ),
            ],
            # an edge targeting the official slot is ignored for officials
            edges=[
                {
                    "type": "gameToGame",
                    "source": "ghost",
                    "target": "g2",
                    "targetHandle": "official",
                }
            ],
        )
        assert issues == []

    def test_dangling_official_ref_is_reported(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "g2",
                    "stage-1",
                    "G2",
                    official={"type": "loser", "matchName": "Nope"},
                ),
            ]
        )
        assert [(i.code, i.message, i.node_ids) for i in issues] == [
            (
                "dangling_reference",
                'Game "G2" references "Nope" for official, but no game produces it.',
                ["g2"],
            )
        ]

    def test_official_static_ref_is_ignored(self):
        _, issues = _validate(
            [_game_node("g1", None, "G1", official={"type": "static", "name": "x"})]
        )
        assert issues == []

    def test_self_reference_by_match_name_is_reported(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "g1",
                    "stage-1",
                    "G1",
                    homeTeamDynamic={"type": "winner", "matchName": "G1"},
                ),
            ]
        )
        assert [(i.code, i.node_ids) for i in issues] == [("self_reference", ["g1"])]

    def test_identical_issue_is_reported_once(self):
        """Two games sharing a standing with the same dangling ref produce the
        same (code, message) key, so only the first is kept."""
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "a",
                    "stage-1",
                    "X",
                    homeTeamDynamic={"type": "winner", "matchName": "Nope"},
                ),
                _game_node(
                    "b",
                    "stage-1",
                    "X",
                    homeTeamDynamic={"type": "winner", "matchName": "Nope"},
                ),
            ]
        )
        assert [(i.code, i.node_ids) for i in issues] == [("dangling_reference", ["a"])]


class TestValidatorRankRefs:
    def test_non_positive_place_is_reported(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node("g1", "stage-1", "G1"),
                _stage_node("stage-2", "field-1", "Finale"),
                _game_node(
                    "fin",
                    "stage-2",
                    "FIN",
                    homeTeamDynamic={
                        "type": "rank",
                        "place": 0,
                        "stageId": "stage-1",
                    },
                    awayTeamDynamic={
                        "type": "groupRank",
                        "place": "2",
                        "stageName": "Vorrunde",
                    },
                ),
            ]
        )
        assert [i.message for i in issues] == [
            'Game "FIN" references an invalid place "0" for home.',
            'Game "FIN" references an invalid place "2" for away.',
        ]
        assert {i.code for i in issues} == {"rank_out_of_range"}

    def test_rank_ref_to_stage_without_id_resolves_by_name(self):
        """A stage node without id is found via its name; its stage id is None,
        so no cycle edge is recorded. Its stage games are those whose parentId
        is also None -- here the referencing game itself -- so place 1 passes."""
        validator, issues = _validate(
            [
                _field(),
                {"type": "stage", "parentId": "field-1", "data": {"name": "NoId"}},
                _game_node(
                    "fin",
                    None,
                    "FIN",
                    homeTeamDynamic={"type": "rank", "place": 1, "stageName": "NoId"},
                ),
            ]
        )
        assert validator._stage_ref == {("fin", "home"): None}
        assert issues == []

    def test_rank_ref_into_own_stage_is_a_cycle_labelled_by_stage_name(self):
        _, issues = _validate(
            [
                _field(),
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "g1",
                    "stage-1",
                    "G1",
                    homeTeamDynamic={
                        "type": "rank",
                        "place": 1,
                        "stageId": "stage-1",
                    },
                ),
            ]
        )
        assert [(i.code, i.message, i.node_ids) for i in issues] == [
            (
                "unresolved_cycle",
                "Circular progression: G1 -> Vorrunde -> G1",
                ["g1", "stage-1"],
            )
        ]

    def test_unit_label_falls_back_to_id_for_unknown_units(self):
        validator = CanvasProgressionValidator({})
        assert validator._unit_label("game:missing") == "missing"
        assert validator._unit_label("stage:missing") == "missing"
