"""Characterization of the frontend journey runner (Phase 3 Layer 1)."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

import runner  # noqa: E402
from diff import Diff  # noqa: E402


def make_args(**overrides):
    values = {
        "ref": "https://ref.example",
        "cand": "https://cand.example",
        "username": "basic-user",
        "password": "basic-password",
        "report": None,
        "run-id": None,
        "run_id": None,
        "comment_pr": [],
        "journeys": [],
        "intended": None,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def make_deps(steps_ref=None, steps_cand=None, skipped=(), journeys=None):
    steps_ref = steps_ref or {"open": {"requests": [], "dom": "same", "aria": "same"}}
    steps_cand = steps_cand or {"open": {"requests": [], "dom": "same", "aria": "same"}}
    calls = {"context": [], "sha": [], "comment": []}

    def journey(context, run_id, credentials):
        assert run_id.endswith(("-ref", "-cand"))
        return (steps_ref if run_id.endswith("-ref") else steps_cand, list(skipped))

    def context(url, username, password, credentials, errors, browser):
        calls["context"].append(url)
        return types.SimpleNamespace(base_url=url)

    def sha(url, username, password):
        calls["sha"].append(url)
        return "aaa" if url.startswith("https://ref") else "bbb"

    deps = {
        "now": lambda: "fe-generated",
        "env": {
            "LS_AGENT_STAFF_USER": "staff",
            "LS_AGENT_STAFF_PASSWORD": "secret",
        },
        "context": context,
        "sha": sha,
        "journeys": journeys or {"demo": journey},
        "browser": object(),
        "comment": lambda pr, text: calls["comment"].append((pr, text)),
    }
    return deps, calls


def test_selected_journeys_all_selection_branches():
    available = {"a": 1, "b": 2}
    assert runner.selected_journeys([], available) == ["a", "b"]
    assert runner.selected_journeys(["b"], available) == ["b"]
    try:
        runner.selected_journeys(["b", "z"], available)
    except ValueError as error:
        assert "z" in str(error)
    else:
        raise AssertionError("unknown journey must fail")


def test_role_credentials_reads_only_present_roles():
    creds = runner.role_credentials(
        {"LS_AGENT_STAFF_USER": "u", "LS_AGENT_OFFICIAL_PASSWORD": "p"}
    )
    assert creds["staff"] == ("u", "")
    assert creds["official"] == ("", "p")
    assert creds["team_manager"] == ("", "")


def test_render_report_without_errors_diffs_or_intent():
    text = runner.render_report(
        run_id="fe-1",
        ref_sha="",
        cand_sha="",
        journey_count=1,
        diffs={},
        skipped={},
        errors=[],
        intended={},
    )
    assert "| ref | `unknown` |" in text
    assert "None." in text
    assert "{}" in text


def test_render_report_with_every_section():
    text = runner.render_report(
        run_id="fe-1",
        ref_sha="aaa",
        cand_sha="bbb",
        journey_count=2,
        diffs={
            "j:open": [Diff("$.dom", "value")],
            "j:declared": [Diff("$.aria", "value")],
        },
        skipped={"j:steps": ["target-missing"]},
        errors=["login failed"],
        intended={"j:declared": ["$.aria"]},
    )
    assert "### Harness errors" in text
    assert "`j:open`: $.dom (value)" in text
    assert "### Intended diffs" in text
    assert "`j:declared`: $.aria (value)" in text
    assert "target-missing" in text
    assert "{'value': 1}" in text


def test_load_intended_empty_and_from_file(tmp_path):
    assert runner._load_intended(None) == {}
    path = tmp_path / "intended.json"
    path.write_text('{"j:open": ["dom"]}', encoding="utf-8")
    assert runner._load_intended(str(path)) == {"j:open": ["dom"]}


def test_run_clean_journeys_returns_zero(capsys):
    deps, calls = make_deps()
    code = runner.run(make_args(run_id="fe-1"), deps)
    out = capsys.readouterr().out
    assert code == 0
    assert "diffs: **0**" in out
    assert calls["context"] == [
        "https://ref.example",
        "https://cand.example",
    ]
    assert len(calls["sha"]) == 2


def test_run_report_comment_and_generated_run_id(tmp_path, capsys):
    left = {"open": {"requests": [], "dom": "left", "aria": "same"}}
    right = {"open": {"requests": [], "dom": "right", "aria": "same"}}
    deps, calls = make_deps(left, right, skipped=("selector-missing",))
    report = tmp_path / "report.md"
    intended = tmp_path / "intended.json"
    intended.write_text('{"demo:open": ["$.dom"]}', encoding="utf-8")
    code = runner.run(
        make_args(report=str(report), comment_pr=[42], intended=str(intended)), deps
    )
    text = report.read_text(encoding="utf-8")
    assert code == 0  # declared, so not unexplained
    assert "fe-generated" in text
    assert "selector-missing" in text
    assert calls["comment"] == [(42, text)]
    capsys.readouterr()


def test_run_unexplained_diff_returns_one(capsys):
    left = {"open": {"requests": [], "dom": "left", "aria": "same"}}
    right = {"open": {"requests": [], "dom": "right", "aria": "same"}}
    deps, _ = make_deps(left, right)
    assert runner.run(make_args(), deps) == 1
    capsys.readouterr()


def test_main_with_injected_deps_and_with_real_dep_factory(monkeypatch, capsys):
    deps, _ = make_deps()
    assert runner.main(["--ref", "r", "--cand", "c"], deps=deps) == 0
    capsys.readouterr()

    module = types.ModuleType("browser")
    module.real_deps = lambda: deps
    monkeypatch.setitem(sys.modules, "browser", module)
    assert runner.main(["--ref", "r", "--cand", "c"]) == 0
    capsys.readouterr()


def test_module_path_setup_covers_both_sys_path_branches():
    # Re-execute the module body with its paths present (False arc) and then
    # removed (insert/True arc). `exec`, not importlib.reload, keeps the module
    # importable while the paths are temporarily absent.
    source = Path(runner.__file__).read_text(encoding="utf-8")
    for part in (str(runner.HERE), str(runner.PARENT)):
        if part not in sys.path:
            sys.path.insert(0, part)
    exec(compile(source, runner.__file__, "exec"), runner.__dict__)
    for part in (str(runner.HERE), str(runner.PARENT)):
        while part in sys.path:
            sys.path.remove(part)
    exec(compile(source, runner.__file__, "exec"), runner.__dict__)
