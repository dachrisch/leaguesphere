"""Tests for the write scenarios (Phase 0c, issue #2536).

The stage is shared by ref and cand, so each side creates its own run-id
tagged entities. These tests pin that contract with a fake API: the two
sides get different raw ids, and their read-backs must still compare equal
after id normalisation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import scenarios  # noqa: E402
from runner import compare_scenario_runs  # noqa: E402
from transport import Response  # noqa: E402


class FakeApi:
    """Minimal fake of the endpoints the scenarios touch."""

    def __init__(self, id_base):
        self.id_base = id_base
        self.calls = []
        self.empty_games = False

    def request(self, path, method="GET", json_body=None, form=None, headers=None):
        self.calls.append(
            {"path": path, "method": method, "json": json_body, "form": form}
        )
        gameday_id = f"/{self.id_base}/"
        if method == "POST" and path == "/api/gamedays/":
            return self._json(201, {"id": self.id_base, "name": json_body["name"]})
        if method == "PUT" and path.endswith("/designer-state/"):
            return self._json(200, {"state_data": json_body["state_data"]})
        if method == "POST" and path.endswith("/apply/"):
            return self._json(
                200,
                {
                    "success": True,
                    "gameinfos_created": 2,
                    "message": "template applied",
                },
            )
        if method == "POST" and path.endswith("/publish/"):
            return self._json(200, {"id": self.id_base, "status": "PUBLISHED"})
        if method == "GET" and path == f"/api/gameday/{self.id_base}/":
            return self._json(200, {"id": self.id_base, "status": "PUBLISHED"})
        if method == "GET" and path.endswith("/games/"):
            return self._json(
                200,
                (
                    []
                    if self.empty_games
                    else [{"id": self.id_base + 50, "home": "Team A"}]
                ),
            )
        if method == "PUT" and path.endswith("/finalize"):
            return self._json(200, {"id": self.id_base + 50, "finished": True})
        if method == "GET" and path.endswith("/officials"):
            return self._json(200, {"officials": []})
        if method == "GET" and path.endswith("/summary"):
            return self._json(200, {"game": {"id": self.id_base + 50}})
        if method == "GET" and "/gamelog/" in path:
            return self._json(200, {"events": [{"game": self.id_base + 50}]})
        if path == "/officials/gameday/sign-up/":
            return Response(status=302, headers={}, body="", url="/login/")
        if "sign-up" in path:
            return Response(status=302, headers={}, body="", url="/login/")
        raise AssertionError(f"unexpected {method} {path}")

    @staticmethod
    def _json(status, payload):
        return Response(
            status=status,
            headers={},
            body=json.dumps(payload),
            url="",
            method="GET",
        )


CONTEXT = {"season_id": 3, "league_id": 7}


def test_designer_publish_tags_entities_with_run_id():
    api = FakeApi(id_base=900)

    run = scenarios.run_scenario(
        "designer-publish", {"staff": api, "anonymous": api}, CONTEXT, "eq-1-ref"
    )

    create = api.calls[0]
    assert create["json"]["name"] == "Equivalence eq-1-ref"
    assert create["json"]["address"] == "equivalence run eq-1-ref"
    assert run.id_tokens == {
        "eq-1-ref": "<run-id>",
        900: "<entity-1>",
        950: "<entity-2>",
    }


def test_both_sides_compare_equal_after_id_normalisation():
    ref = FakeApi(id_base=900)
    cand = FakeApi(id_base=1500)

    ref_run = scenarios.run_scenario(
        "designer-publish", {"staff": ref, "anonymous": ref}, CONTEXT, "eq-2-ref"
    )
    cand_run = scenarios.run_scenario(
        "designer-publish", {"staff": cand, "anonymous": cand}, CONTEXT, "eq-2-cand"
    )

    assert compare_scenario_runs(ref_run, cand_run) == {}


def test_read_back_uses_the_captured_gameday_id():
    api = FakeApi(id_base=900)

    scenarios.run_scenario(
        "finalize-game", {"staff": api, "anonymous": api}, CONTEXT, "eq-3-ref"
    )

    paths = [call["path"] for call in api.calls]
    assert "/api/gamedays/900/games/" in paths
    assert "/api/game/950/finalize" in paths
    assert "/api/gamelog/950" in paths


def test_officials_signup_skips_without_an_official_session():
    api = FakeApi(id_base=900)

    run = scenarios.run_scenario(
        "officials-signup", {"staff": api}, CONTEXT, "eq-4-ref"
    )

    assert run.skipped == ["signup-list", "signup-add"]


def test_officials_signup_runs_when_an_official_session_exists():
    api = FakeApi(id_base=900)

    run = scenarios.run_scenario(
        "officials-signup",
        {"staff": api, "official": api},
        CONTEXT,
        "eq-5-ref",
    )

    assert run.skipped == []
    assert [step.name for step in run.steps] == [
        "create-gameday",
        "signup-list",
        "signup-add",
    ]


def test_missing_capture_does_not_abort_the_scenario():
    api = FakeApi(id_base=900)
    api.empty_games = True

    run = scenarios.run_scenario(
        "designer-publish", {"staff": api, "anonymous": api}, CONTEXT, "eq-6-ref"
    )

    assert "game_id" not in run.id_tokens


def _step_names(name):
    return [step.name for step in scenarios.SCENARIOS[name]]


def test_finalize_legacy_has_no_designer_state_step():
    names = _step_names("finalize-legacy")
    assert "save-designer-canvas" not in names
    assert "publish-gameday" in names and "finalize-game" in names


def test_finalize_canvas_has_a_downstream_reference():
    canvas = scenarios.CANVAS_WITH_REFERENCE
    games = [node for node in canvas["nodes"] if node["type"] == "game"]
    assert len(games) == 2
    assert games[1]["data"]["homeTeamDynamic"]["type"] == "winner"
    assert (
        games[1]["data"]["homeTeamDynamic"]["matchName"] == games[0]["data"]["standing"]
    )
    assert any(
        edge.get("type") == "gameToGame"
        and edge["source"] == games[0]["id"]
        and edge["target"] == games[1]["id"]
        for edge in canvas["edges"]
    )
    step = next(
        step
        for step in scenarios.SCENARIOS["finalize-canvas"]
        if step.name == "save-designer-canvas"
    )
    assert step.json["state_data"] is canvas


def test_finalize_template_applies_a_template():
    names = _step_names("finalize-template")
    assert "apply-template" in names
    assert "save-designer-canvas" not in names
    assert "read-gamelog" in names


def test_whole_token_resolution_keeps_dict_and_int_payloads():
    context = {
        "gameday_id": 900,
        "team_mapping": {"0_0": 11, "0_1": 12},
        "num_fields": 2,
    }
    resolved = scenarios._resolve(
        {
            "gameday_id": "{gameday_id}",
            "team_mapping": "{team_mapping}",
            "num_fields": "{num_fields}",
        },
        context,
    )
    assert resolved == context


def test_finalize_template_sends_apply_payload_and_compares():
    ref = FakeApi(id_base=900)
    cand = FakeApi(id_base=1500)
    context = {
        **CONTEXT,
        "template_id": 42,
        "team_mapping": {"0_0": 11, "0_1": 12},
        "num_fields": 2,
    }
    ref_run = scenarios.run_scenario(
        "finalize-template", {"staff": ref, "anonymous": ref}, context, "eq-t-ref"
    )
    cand_run = scenarios.run_scenario(
        "finalize-template", {"staff": cand, "anonymous": cand}, context, "eq-t-cand"
    )
    apply_call = ref.calls[1]
    assert apply_call["path"] == "/api/designer/templates/42/apply/"
    assert apply_call["json"] == {
        "gameday_id": 900,
        "team_mapping": {"0_0": 11, "0_1": 12},
        "num_fields": 2,
    }
    assert compare_scenario_runs(ref_run, cand_run) == {}


class FakeSession:
    def __init__(self, responses):
        self.responses = responses

    def request(self, path, method="GET", json_body=None, form=None, headers=None):
        return self.responses.get(path, Response(404, {}, "", "", method))


def _json_response(payload, status=200):
    return Response(status, {}, json.dumps(payload), "", "GET")


TEMPLATE_DETAIL = {
    "id": 42,
    "num_fields": 2,
    "slots": [
        {"home_group": 0, "home_team": 0, "away_group": 0, "away_team": 1},
    ],
}


def _template_sessions(detail=None, teams=None, listing_status=200):
    responses = {
        "/api/designer/templates/": _json_response(
            {"results": [{"id": 42}]}, listing_status
        ),
        "/api/designer/templates/42/": _json_response(
            TEMPLATE_DETAIL if detail is None else detail
        ),
        "/api/teams/": _json_response(
            {"results": teams if teams is not None else [{"id": 11}, {"id": 12}]}
        ),
    }
    return {"staff": FakeSession(responses), "anonymous": FakeSession(responses)}


def test_discover_template_context_builds_the_mapping():
    context = scenarios.discover_template_context(_template_sessions())
    assert context == {
        "template_id": 42,
        "team_mapping": {"0_0": 11, "0_1": 12},
        "num_fields": 2,
    }


def test_discover_template_context_returns_empty_without_staff():
    assert scenarios.discover_template_context({}) == {}


def test_discover_template_context_returns_empty_on_bad_listing():
    assert (
        scenarios.discover_template_context(_template_sessions(listing_status=500))
        == {}
    )
    empty = _template_sessions()
    empty["staff"].responses["/api/designer/templates/"] = _json_response(
        {"results": []}
    )
    assert scenarios.discover_template_context(empty) == {}


def test_discover_template_context_returns_empty_on_bad_detail():
    sessions = _template_sessions()
    sessions["staff"].responses["/api/designer/templates/42/"] = _json_response(
        {}, status=404
    )
    assert scenarios.discover_template_context(sessions) == {}


def test_discover_template_context_returns_empty_without_placeholders():
    sessions = _template_sessions(detail={"id": 42, "slots": [{"id": 1}]})
    assert scenarios.discover_template_context(sessions) == {}


def test_discover_template_context_returns_empty_on_bad_teams_response():
    sessions = _template_sessions()
    sessions["anonymous"].responses["/api/teams/"] = Response(500, {}, "", "", "GET")
    assert scenarios.discover_template_context(sessions) == {}


def test_discover_template_context_returns_empty_without_enough_teams():
    sessions = _template_sessions(teams=[{"id": 11}])
    assert scenarios.discover_template_context(sessions) == {}


def test_discover_template_context_tolerates_bad_json():
    sessions = _template_sessions()
    sessions["staff"].responses["/api/designer/templates/"] = Response(
        200, {}, "not json", "", "GET"
    )
    assert scenarios.discover_template_context(sessions) == {}
