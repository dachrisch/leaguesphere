"""Characterization of the harness before the Phase 2 coverage extension.

Pins the current exit codes, report sections, manifest expansion and scenario
step shapes. The branch-coverage gate is run against HEAD with the original
functions in scope before any of them is edited.
"""

from __future__ import annotations

import sys
from types import SimpleNamespace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import probes  # noqa: E402
import report  # noqa: E402
import runner  # noqa: E402
import scenarios  # noqa: E402
from diff import TYPE, VALUE, Diff  # noqa: E402
from transport import RecordedSession, Response  # noqa: E402

from test_runner import routes_for, server_factory, write_manifest  # noqa: E402
from test_scenarios import CONTEXT  # noqa: E402

GAMEDAYS = [
    {
        "id": 11,
        "season": 3,
        "league": 7,
        "status": "PUBLISHED",
        "has_designer_state": True,
    },
    {
        "id": 12,
        "season": 3,
        "league": 7,
        "status": "PUBLISHED",
        "has_designer_state": True,
    },
]
MANIFEST = {
    "roles": {"anonymous": {}},
    "discovery": {"path": "/api/gamedays/", "results_key": "results"},
    "categories": [
        {"name": "designer-template", "where": {"has_designer_state": True}}
    ],
    "sample_per_category": 2,
    "probes": [
        {
            "name": "gameday-api",
            "path": "/api/gameday/{gameday_id}/",
            "kind": "json",
            "role": "anonymous",
            "categories": ["designer-template"],
        },
        {"name": "root", "path": "/", "kind": "html", "role": "anonymous"},
    ],
}


def rendered(**overrides):
    kwargs = dict(
        run_id="eq-char",
        ref_sha="ref",
        cand_sha="cand",
        probe_count=1,
        skipped_probes=[],
        intended={},
        diffs={},
        scenario_runs={},
        scenario_diffs={},
        errors=[],
    )
    kwargs.update(overrides)
    return report.render_report(**kwargs)


def test_characterization_report_sections_without_scenarios():
    text = rendered()
    assert "No scenario was run." in text
    assert "### Unexplained diffs" in text
    assert "### Write scenarios" in text
    assert "None." in text


def test_characterization_report_errors_and_scenario_diffs():
    text = rendered(
        errors=["harness broke"],
        scenario_runs={"finalize-game": []},
        scenario_diffs={"finalize-game:read-gamelog": [Diff("$.x", VALUE)]},
    )
    assert "### Harness errors" in text
    assert "harness broke" in text
    assert "`finalize-game`: diff" in text
    assert "### Scenario diffs" in text
    assert "$.x (value)" in text


def test_characterization_split_intended_keeps_only_declared_paths():
    diffs = {"probe": [Diff("$.a", VALUE), Diff("$.b", VALUE)]}
    intended, unexplained = report.split_intended(diffs, {"probe": ["$.b"]})
    assert intended == {"probe": [Diff("$.b", VALUE)]}
    assert unexplained == {"probe": [Diff("$.a", VALUE)]}


def test_characterization_compare_scenario_runs_all_diff_kinds():
    def run(step, status, body):
        return scenarios.StepResult(step, status, body)

    left = SimpleNamespace(
        as_results=lambda: {
            "s:status": run("status", 200, {}),
            "s:json": run("json", 200, {"a": 1}),
            "s:text": run("text", 200, "<p>a</p>"),
            "s:type": run("type", 200, 1),
            "s:same": run("same", 200, {"ok": True}),
        }
    )
    right = SimpleNamespace(
        as_results=lambda: {
            "s:status": run("status", 201, {}),
            "s:json": run("json", 200, {"a": 2}),
            "s:text": run("text", 200, "<p>b</p>"),
            "s:type": run("type", 200, "1"),
            "s:same": run("same", 200, {"ok": True}),
            "s:extra": run("extra", 200, {}),
        }
    )

    found = runner.compare_scenario_runs(left, right)

    assert found["s:status"] == [Diff("status", VALUE)]
    assert found["s:json"] == [Diff("$.a", VALUE)]
    assert found["s:text"]
    assert found["s:type"] == [Diff("$", TYPE)]
    assert "s:same" not in found
    assert "s:extra" not in found


def test_characterization_manifest_expansion_dedupes_repeated_paths():
    expanded = probes.expand_probes(MANIFEST, GAMEDAYS)
    names = [probe.name for probe in expanded]
    # Both sampled gamedays resolve to the same path/role/kind key for the
    # root probe, which is kept once.
    assert names.count("root") == 1
    assert "gameday-api#designer-template:11" in names
    assert "gameday-api#designer-template:12" in names


def test_characterization_probes_diff_every_body_shape():
    def result(status, body):
        return probes.ProbeResult("p", status, "json", body)

    diffs = probes.compare_probe_results(
        {"p": result(200, {"a": 1})},
        {"p": result(201, {"a": 2})},
    )
    assert diffs["p"] == [Diff("status", "value"), Diff("$.a", VALUE)]

    text = probes.compare_probe_results(
        {"p": result(200, "a")}, {"p": result(200, "b")}
    )
    assert text["p"]
    scalar = probes.compare_probe_results(
        {"p": result(200, 1)}, {"p": result(200, "1")}
    )
    assert scalar["p"] == [Diff("$", TYPE)]
    assert (
        probes.compare_probe_results({"p": result(200, 1)}, {"q": result(200, 1)}) == {}
    )


def test_characterization_scenario_context_and_missing_game(
    monkeypatch, tmp_path, server_factory
):
    assert runner.scenario_context([]) == {}
    assert runner.scenario_context(GAMEDAYS) == {"season_id": 3, "league_id": 7}

    # A scenario step whose expected status never arrives is a harness error,
    # not a fake diff; the runner still exits zero.
    routes = routes_for("r")
    routes[("GET", "/api/gamedays/")] = (
        200,
        {"results": [{"id": 1, "season": 2, "league": 3}]},
        "application/json",
    )
    routes[("POST", "/api/gamedays/")] = (201, {"id": 7})
    ref, ref_url = server_factory(routes)
    cand, cand_url = server_factory(routes)
    manifest = write_manifest(tmp_path, with_staff=False)
    out = tmp_path / "report.md"
    code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(out),
            "--scenarios",
            "designer-publish",
        ]
    )
    assert code == 0
    assert "Harness errors" in out.read_text()


def test_characterization_baked_sha_fallbacks():
    session = RecordedSession({("GET", "/health/version/"): (500, "nope")})
    assert runner.baked_sha(session) == "unknown"
    session = RecordedSession({("GET", "/health/version/"): (200, "not json")})
    assert runner.baked_sha(session) == "unknown"


def test_characterization_scenario_capture_failure_is_tolerated():
    from test_scenarios import FakeApi, CONTEXT

    api = FakeApi(id_base=900)
    api.empty_games = True
    run = scenarios.run_scenario(
        "finalize-game", {"staff": api, "anonymous": api}, CONTEXT, "eq-char-ref"
    )
    assert [step.name for step in run.steps] == [
        "create-gameday",
        "save-designer-canvas",
        "publish-gameday",
        "read-games",
        "read-games-home-id",
        "read-games-away-id",
        "finalize-game",
        "read-game-officials",
        "read-game-summary",
        "read-gamelog",
    ]


def test_characterization_discovery_failure_and_missing_placeholders():
    session = RecordedSession({("GET", "/api/gamedays/"): (500, "nope")})
    with pytest.raises(RuntimeError, match="discovery failed"):
        probes.discover(session, MANIFEST)

    # A gameday with no id cannot resolve {gameday_id}; those category probes
    # are skipped rather than run as 404-on-both-sides comparisons.
    manifest = dict(MANIFEST)
    expanded = probes.expand_probes(manifest, [{**GAMEDAYS[0], "id": None}])
    assert all("{gameday_id}" not in probe.path for probe in expanded)


def test_characterization_duplicate_probe_key_is_collapsed():
    manifest = dict(MANIFEST)
    manifest["probes"] = [
        {
            "name": "constant",
            "path": "/same/",
            "kind": "json",
            "role": "anonymous",
            "categories": ["designer-template"],
        }
    ]
    expanded = probes.expand_probes(manifest, GAMEDAYS)
    assert len(expanded) == 1


def test_characterization_equal_probe_bodies_are_not_a_diff():
    def result(body):
        return probes.ProbeResult("p", 200, "json", body)

    assert probes.compare_probe_results({"p": result(1)}, {"p": result(1)}) == {}


def test_characterization_scenario_context_skips_incomplete_gameday():
    assert runner.scenario_context([{"id": 1, "season": None, "league": 7}]) == {}


def test_characterization_equal_scalar_scenario_bodies_are_not_a_diff():
    left = SimpleNamespace(
        as_results=lambda: {"s:x": scenarios.StepResult("x", 200, 1)}
    )
    right = SimpleNamespace(
        as_results=lambda: {"s:x": scenarios.StepResult("x", 200, 1)}
    )
    assert runner.compare_scenario_runs(left, right) == {}


def test_characterization_run_reports_missing_probe_and_comments(
    monkeypatch, tmp_path, server_factory
):
    ref, ref_url = server_factory(routes_for("r"))
    cand, cand_url = server_factory(routes_for("c"))
    manifest = write_manifest(tmp_path, with_staff=False)
    out = tmp_path / "report.md"
    monkeypatch.setattr(
        probe_mod_for_test(), "only_left", lambda left, right: ["ghost"]
    )
    calls = []
    monkeypatch.setattr(runner.subprocess, "run", lambda *a, **k: calls.append(a))

    code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(out),
            "--comment-pr",
            "123",
            "--skip-scenarios",
        ]
    )

    assert code == 1
    assert "ghost" in out.read_text()
    assert calls and calls[0][0][:2] == ["gh", "pr"]


def probe_mod_for_test():
    return runner.probe_mod


def test_characterization_run_reports_scenario_diff(
    monkeypatch, server_factory, tmp_path
):
    ref, ref_url = server_factory(routes_for("r"))
    cand, cand_url = server_factory(routes_for("c"))
    manifest = write_manifest(tmp_path, with_staff=False)
    out = tmp_path / "report.md"

    def fake_run(name, sessions, context, run_id):
        return scenarios.ScenarioRun(
            name=name,
            run_id=run_id,
            steps=[scenarios.StepResult("read-gameday", 200, {})],
        )

    monkeypatch.setattr(runner.scenario_mod, "run_scenario", fake_run)
    monkeypatch.setattr(
        runner,
        "compare_scenario_runs",
        lambda left, right: {"designer-publish:read-gameday": [Diff("$.name", VALUE)]},
    )

    code = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--report",
            str(out),
            "--scenarios",
            "designer-publish",
        ]
    )
    assert code == 1
    assert "designer-publish" in out.read_text()


def test_characterization_scalar_scenario_payload_is_kept():
    class ScalarApi:
        def request(
            self,
            path,
            method="GET",
            json_body=None,
            form=None,
            headers=None,
            follow_redirects=True,
            files=None,
        ):
            return Response(status=200, headers={}, body="42", url="", method=method)

    run = scenarios.run_scenario(
        "officials-signup", {"staff": ScalarApi()}, CONTEXT, "eq-scalar-ref"
    )
    assert run.steps[0].body == 42
