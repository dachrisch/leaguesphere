"""Phase 2 coverage extension: game/feed probes and the new write scenarios."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import probes  # noqa: E402
import report  # noqa: E402
import runner  # noqa: E402
import scenarios  # noqa: E402
from diff import VALUE, Diff  # noqa: E402
from transport import RecordedSession  # noqa: E402

from test_runner import routes_for, server_factory, write_manifest  # noqa: E402
from test_scenarios import CONTEXT, FakeApi  # noqa: E402

MANIFEST = {
    "roles": {"anonymous": {}},
    "discovery": {"path": "/api/gamedays/", "results_key": "results"},
    "game_discovery": {"path": "/api/gamedays/{gameday_id}/games/"},
    "categories": [{"name": "any", "where": {}}],
    "sample_per_category": 1,
    "probes": [
        {
            "name": "game-feed",
            "path": "/api/game/{game_id}/feed",
            "kind": "json",
            "role": "anonymous",
            "categories": ["any"],
        },
        {
            "name": "feed-revalidation",
            "path": "/api/game/{game_id}/feed",
            "kind": "json",
            "role": "anonymous",
            "categories": ["any"],
            "headers": {"If-None-Match": "@etag:game-feed"},
        },
    ],
}
GAMEDAYS = [{"id": 11, "season": 3, "league": 7}]


def test_discover_games_adds_one_sampled_game_id():
    session = RecordedSession({("GET", "/api/gamedays/11/games/"): (200, [{"id": 45}])})
    enriched = probes.discover_games(session, MANIFEST, GAMEDAYS)

    assert enriched[0]["game_id"] == 45
    assert GAMEDAYS[0].get("game_id") is None


def test_discover_games_tolerates_bad_and_empty_responses():
    empty = RecordedSession({("GET", "/api/gamedays/11/games/"): (500, "nope")})
    assert "game_id" not in probes.discover_games(empty, MANIFEST, GAMEDAYS)[0]

    malformed = RecordedSession({("GET", "/api/gamedays/11/games/"): (200, "not json")})
    assert "game_id" not in probes.discover_games(malformed, MANIFEST, GAMEDAYS)[0]

    no_rows = RecordedSession({("GET", "/api/gamedays/11/games/"): (200, [])})
    assert "game_id" not in probes.discover_games(no_rows, MANIFEST, GAMEDAYS)[0]


def test_manifest_expands_feed_probe_with_the_sampled_game():
    expanded = probes.expand_probes(
        MANIFEST,
        probes.discover_games(
            RecordedSession({("GET", "/api/gamedays/11/games/"): (200, [{"id": 45}])}),
            MANIFEST,
            GAMEDAYS,
        ),
    )
    assert any(probe.path == "/api/game/45/feed" for probe in expanded)


def test_etag_revalidation_resolves_exact_prefix_and_missing_sources():
    from transport import Response

    class ETagSession:
        def __init__(self):
            self.sent = []

        def request(self, path, headers=None):
            self.sent.append(headers)
            return Response(
                status=200,
                headers={"ETag": '"sample"'},
                body="{}",
                url=path,
            )

    session = ETagSession()
    source = probes.Probe("game-feed#any:11", "/api/game/45/feed", "json", "anonymous")
    revalidation = probes.Probe(
        "feed-revalidation#any:11",
        "/api/game/45/feed",
        "json",
        "anonymous",
        {"If-None-Match": "@etag:game-feed"},
    )
    results, skipped = probes.run_probes(
        {"anonymous": session}, MANIFEST, [source, revalidation]
    )

    assert skipped == []
    assert session.sent[0] == {}
    # Prefix fallback found the category-expanded source's validator.
    assert session.sent[1]["If-None-Match"] == '"sample"'

    missing = probes.Probe(
        "missing", "/x", "json", "anonymous", {"If-None-Match": "@etag:nope"}
    )
    probes.run_probes({"anonymous": ETagSession()}, MANIFEST, [missing])


def test_discover_team_id_handles_valid_empty_and_bad_responses():
    assert (
        scenarios.discover_team_id(
            RecordedSession(
                {("GET", "/api/teams/"): (200, {"results": [{"id": 9}, {"id": 10}]})}
            )
        )
        == 9
    )
    assert (
        scenarios.discover_team_id(
            RecordedSession({("GET", "/api/teams/"): (200, {"results": []})})
        )
        is None
    )
    assert (
        scenarios.discover_team_id(
            RecordedSession({("GET", "/api/teams/"): (500, "nope")})
        )
        is None
    )
    assert (
        scenarios.discover_team_id(
            RecordedSession({("GET", "/api/teams/"): (200, "not json")})
        )
        is None
    )


def test_new_scenarios_have_expected_step_shapes():
    assert [step.name for step in scenarios.SCENARIOS["v2-events-write"][-4:]] == [
        "write-events",
        "read-feed",
        "read-gamelog",
        "read-liveticker",
    ]
    assert scenarios.SCENARIOS["reconciliation-flag"][-3].name == "flag-projection"
    wizard_names = [step.name for step in scenarios.SCENARIOS["legacy-wizard-finalize"]]
    assert wizard_names[0] == "wizard-create-gameday"
    assert "wizard-legacy-json-schedule" in wizard_names
    assert "finalize-game" in wizard_names


def test_client_id_token_is_normalised_and_form_steps_are_sent():
    api = FakeApi(id_base=900)

    run = scenarios.run_scenario(
        "v1-shadow-write", {"staff": api, "anonymous": api}, CONTEXT, "eq-p2-ref"
    )

    assert any(token == "<client-id>" for token in run.id_tokens.values())
    shadow = [call for call in api.calls if call["path"].endswith("/api/gamelog/950")][
        0
    ]
    assert shadow["json"]["client_id"] == str(
        __import__("uuid").uuid5(__import__("uuid").NAMESPACE_URL, "eq-p2-ref")
    )


def test_intended_scenario_diff_is_accepted_and_rendered(tmp_path):
    diffs = {"v1-shadow-write:read-feed": [Diff("$.events[]", VALUE)]}
    intended, unexplained = report.split_intended(
        diffs, {"v1-shadow-write:read-feed": ["$.events[]"]}
    )
    assert intended and not unexplained

    text = report.render_report(
        run_id="eq-p2",
        ref_sha="ref",
        cand_sha="cand",
        probe_count=1,
        skipped_probes=[],
        intended={"v1-shadow-write:read-feed": ["$.events[]"]},
        diffs={},
        scenario_runs={"v1-shadow-write": []},
        scenario_diffs=diffs,
        errors=[],
    )
    assert "### Intended diffs (declared by this phase)" in text
    assert "v1-shadow-write:read-feed" in text
    assert "### Unexplained diffs" in text


def test_runner_accepts_intended_scenario_diff_and_rejects_unexplained(
    monkeypatch, server_factory, tmp_path
):
    ref, ref_url = server_factory(routes_for("r"))
    cand, cand_url = server_factory(routes_for("c"))
    manifest = write_manifest(tmp_path, with_staff=False)
    intended = {"designer-publish:read-gameday": ["$.name"]}
    intended_file = tmp_path / "intended.json"
    intended_file.write_text(json.dumps(intended), encoding="utf-8")

    def fake_run(name, sessions, context, run_id):
        return scenarios.ScenarioRun(
            name=name,
            run_id=run_id,
            steps=[scenarios.StepResult("read-gameday", 200, {})],
        )

    monkeypatch.setattr(runner.scenario_mod, "run_scenario", fake_run)
    monkeypatch.setattr(runner.scenario_mod, "discover_team_id", lambda session: 1)
    monkeypatch.setattr(
        runner,
        "compare_scenario_runs",
        lambda left, right: {"designer-publish:read-gameday": [Diff("$.name", VALUE)]},
    )

    accepted = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--scenarios",
            "designer-publish",
            "--intended",
            str(intended_file),
        ]
    )
    assert accepted == 0

    bad_intended = {"another:step": ["$.other"]}
    bad_file = tmp_path / "bad.json"
    bad_file.write_text(json.dumps(bad_intended), encoding="utf-8")
    rejected = runner.main(
        [
            "--ref",
            ref_url,
            "--cand",
            cand_url,
            "--manifest",
            str(manifest),
            "--scenarios",
            "designer-publish",
            "--intended",
            str(bad_file),
        ]
    )
    assert rejected == 1


def test_wizard_capture_from_url_is_normalised():
    from transport import Response

    class WizardApi:
        def __init__(self, url):
            self.url = url

        def request(self, path, method="GET", json_body=None, form=None, headers=None):
            if method == "POST" and path == "/gamedays/gameday/new/":
                return Response(200, {}, "{}", self.url, method=method)
            return Response(200, {}, "{}", self.url, method=method)

    run = scenarios.run_scenario(
        "legacy-wizard-finalize",
        {"staff": WizardApi("/gamedays/gameday/432/gameinfos/wizard/")},
        {**CONTEXT, "team_id": 1},
        "eq-wizard-ref",
    )
    assert 432 in run.id_tokens
    assert run.id_tokens[432].startswith("<entity-")

    no_match = scenarios.run_scenario(
        "legacy-wizard-finalize",
        {"staff": WizardApi("/somewhere/else/")},
        {**CONTEXT, "team_id": 1},
        "eq-wizard-nomatch",
    )
    assert 432 not in no_match.id_tokens


def test_selftest_reports_login_failures(monkeypatch, server_factory, tmp_path):
    import selftest

    monkeypatch.setenv("LS_AGENT_STAFF_USER", "agent_staff")
    monkeypatch.setenv("LS_AGENT_STAFF_PASSWORD", "wrong")
    routes = routes_for("r")
    routes[("POST", "/login/")] = (401, "no", "text/plain")
    _server, url = server_factory(routes)
    manifest = write_manifest(tmp_path, with_staff=True)

    assert selftest.main(["--url", url, "--manifest", str(manifest)]) == 1


def test_capture_regex_without_a_match_is_tolerated(monkeypatch):
    from scenarios import Step
    from transport import Response

    class NoDigits:
        def request(self, path, method="GET", json_body=None, form=None, headers=None):
            return Response(200, {}, "<p>no digits</p>", path, method=method)

    monkeypatch.setattr(
        scenarios,
        "SCENARIOS",
        {
            **scenarios.SCENARIOS,
            "capture-regex-probe": [
                Step(
                    name="read",
                    method="GET",
                    path="/x/",
                    role="anonymous",
                    expect=200,
                    capture_regex=r"<td>(\d+)</td>",
                )
            ],
        },
    )
    run = scenarios.run_scenario(
        "capture-regex-probe", {"anonymous": NoDigits()}, CONTEXT, "eq-nomatch"
    )
    assert [step.name for step in run.steps] == ["read"]


def test_capture_regex_with_a_match_is_normalised(monkeypatch):
    from scenarios import Step
    from transport import Response

    class WithDigits:
        def request(self, path, method="GET", json_body=None, form=None, headers=None):
            return Response(200, {}, "<td>42</td>", path, method=method)

    monkeypatch.setattr(
        scenarios,
        "SCENARIOS",
        {
            **scenarios.SCENARIOS,
            "capture-regex-hit": [
                Step(
                    name="read",
                    method="GET",
                    path="/x/",
                    role="anonymous",
                    expect=200,
                    capture_regex=r"<td>(\d+)</td>",
                )
            ],
        },
    )
    run = scenarios.run_scenario(
        "capture-regex-hit", {"anonymous": WithDigits()}, CONTEXT, "eq-match"
    )
    assert 42 in run.id_tokens
