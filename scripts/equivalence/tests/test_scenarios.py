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
        if method == "PUT" and path.endswith("/designer-state"):
            return self._json(200, {"state_data": json_body["state_data"]})
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
        if method == "POST" and path.endswith("/finalize"):
            return self._json(200, {"id": self.id_base + 50, "finished": True})
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
