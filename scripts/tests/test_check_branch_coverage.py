"""Tests for scripts/check_branch_coverage.py (Phase 1, #2537).

The gate is stdlib-only and runs on every Python shard. These tests build tiny
git repositories under ``tmp_path`` so every branch of the gate is exercised:
diff scope, new files, ownership, pragmas, overrides and failure modes.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import check_branch_coverage  # noqa: E402  (path set up above)


@pytest.fixture()
def gate():
    return check_branch_coverage


def git(repo, *args, check=True):
    return subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, check=check
    )


def make_repo(tmp_path, base=None, head=None, untracked=None):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "gate@example.com")
    git(repo, "config", "user.name", "Gate")
    for name, text in {".coveragerc": COVERAGERC, **(base or {})}.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "base")
    for name, text in (head or {}).items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    for name, text in (untracked or {}).items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    if head:
        git(repo, "add", "-A")
        git(repo, "commit", "--allow-empty", "-qm", "head")
    return repo


def function(
    name,
    executed=(),
    missing=(),
    excluded=(),
    missing_branches=(),
    branches=(),
    start_line=None,
):
    return {
        "executed_lines": list(executed),
        "missing_lines": list(missing),
        "excluded_lines": list(excluded),
        "executed_branches": [list(item) for item in branches],
        "missing_branches": [list(item) for item in missing_branches],
        "start_line": start_line or min([*executed, *missing, *excluded] or [1]),
    }


def write_coverage(tmp_path, files, name="coverage.json", raw=None):
    """Write coverage JSON, including the realistic module-level "" entry.

    coverage.py 7.17 puts module-level lines *and every function's def line*
    in the "" function; omitting that entry made the old tests pass for the
    wrong reason.
    """
    path = tmp_path / name
    if raw is not None:
        path.write_text(raw, encoding="utf-8")
    else:
        enriched = {}
        for file_name, info in files.items():
            functions = dict(info.get("functions", {}))
            if "" not in functions:
                def_lines = sorted(
                    {
                        fn["start_line"]
                        for fn in functions.values()
                        if fn.get("start_line")
                    }
                )
                functions[""] = {
                    "executed_lines": [],
                    "missing_lines": def_lines,
                    "excluded_lines": [],
                    "executed_branches": [],
                    "missing_branches": [],
                    "start_line": 1,
                }
            enriched[file_name] = {**info, "functions": functions}
        path.write_text(
            json.dumps({"meta": {}, "files": enriched, "totals": {}}), encoding="utf-8"
        )
    return path


def invoke(gate, repo, coverage, *extra, base="HEAD~1", cwd=None):
    return gate.main(
        [
            "--coverage",
            str(coverage),
            "--base",
            base,
            "--root",
            str(repo),
            *extra,
        ]
    )


def test_pass_with_zero_missing_branches(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f(x):\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f(x):\n    return 2\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {"gamedays/service/demo.py": {"functions": {"f": function("f", executed=[2])}}},
    )
    assert invoke(gate, repo, coverage) == 0
    out = capsys.readouterr().out
    assert "1 functions in scope, 1 files, 0 missing branches" in out


def test_fail_lists_missing_branch(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f(x):\n    pass\n"},
        head={"gamedays/service/demo.py": "def f(x):\n    return 1\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "f": function("f", executed=[2], missing_branches=[[2, 3]])
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 1
    out = capsys.readouterr().out
    assert "missing branch" in out and "2->3" in out and "f" in out


def test_diff_touches_function_scope(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={
            "gamedays/service/demo.py": "def a():\n    return 1\ndef b():\n    return 2\n"
        },
        head={
            "gamedays/service/demo.py": "def a():\n    return 1\ndef b():\n    return 3\n"
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "a": function("a", executed=[2], missing_branches=[[1, 2]]),
                    "b": function("b", executed=[4]),
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "1 functions in scope" in capsys.readouterr().out


def test_new_file_puts_all_functions_in_scope(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "x = 1\n"},
        untracked={"gamedays/service/new.py": "def a():\n    return 1\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/new.py": {
                "functions": {
                    "a": function("a", executed=[2]),
                    "b": function("b", executed=[9]),
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "2 functions in scope" in capsys.readouterr().out


def test_line_outside_any_function_is_ignored(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "X = 1\n"},
        head={"gamedays/service/demo.py": "X = 2\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {"f": function("f", executed=[50])}
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


@pytest.mark.parametrize(
    "name",
    [
        "gamedays/tests/test_x.py",
        "gamedays/migrations/0001_x.py",
        "gamedays/apps.py",
        "gamedays/urls.py",
        "gamedays/__init__.py",
        "docs/readme.py.txt",
    ],
)
def test_omitted_and_non_python_files_are_ignored(gate, tmp_path, name, capsys):
    repo = make_repo(
        tmp_path,
        base={"keep.py": "x = 1\n"},
        head={"keep.py": "x = 1\n", name: "y = 2\n"},
    )
    coverage = write_coverage(tmp_path, {})
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


def test_unowned_changed_python_file_fails(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"mystery/x.py": "def f():\n    return 1\n"},
        head={"mystery/x.py": "def f():\n    return 2\n"},
    )
    coverage = write_coverage(
        tmp_path, {"mystery/x.py": {"functions": {"f": function("f", executed=[2])}}}
    )
    assert invoke(gate, repo, coverage) == 1
    assert "ownership mapping" in capsys.readouterr().out


def test_file_absent_from_json_fails(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f():\n    return 2\n"},
    )
    coverage = write_coverage(tmp_path, {})
    assert invoke(gate, repo, coverage) == 1
    assert "no branch data" in capsys.readouterr().out


def test_require_file_and_function_override_scope(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f():\n    return 1\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "f": function("f", executed=[2], missing_branches=[[2, 3]]),
                    "g": function("g", executed=[5]),
                }
            }
        },
    )
    assert (
        invoke(
            gate,
            repo,
            coverage,
            "--require-file",
            "gamedays/service/demo.py",
            "--require-function",
            "g",
        )
        == 0
    )
    out = capsys.readouterr().out
    assert "1 functions in scope" in out

    assert (
        invoke(
            gate,
            repo,
            coverage,
            "--require-file",
            "gamedays/service/demo.py",
            "--require-function",
            "f",
        )
        == 1
    )


def test_require_function_without_file_uses_diff_files(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f():\n    return 2\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "f": function("f", executed=[2]),
                    "g": function("g", executed=[5], missing_branches=[[5, 6]]),
                }
            }
        },
    )
    assert invoke(gate, repo, coverage, "--require-function", "f") == 0
    assert "1 functions in scope" in capsys.readouterr().out


def test_merge_base_fallback_when_git_fails(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f():\n    return 2\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {"gamedays/service/demo.py": {"functions": {"f": function("f", executed=[2])}}},
    )
    assert invoke(gate, repo, coverage, base="no-such-ref") == 0
    assert "merge-base" in capsys.readouterr().out.lower()


def test_pragma_with_inline_reason_passes_and_prints(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={
            "gamedays/service/demo.py": (
                "def f():\n"
                "    if True:  # pragma: no branch -- constant guard\n"
                "        return 1\n"
            )
        },
    )
    coverage = write_coverage(
        tmp_path,
        {"gamedays/service/demo.py": {"functions": {"f": function("f", executed=[3])}}},
    )
    assert invoke(gate, repo, coverage) == 0
    out = capsys.readouterr().out
    assert "pragma" in out and "constant guard" in out


def test_pragma_without_reason_fails(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={
            "gamedays/service/demo.py": ("def f():\n    return 1  # pragma: no cover\n")
        },
    )
    coverage = write_coverage(
        tmp_path,
        {"gamedays/service/demo.py": {"functions": {"f": function("f", executed=[2])}}},
    )
    assert invoke(gate, repo, coverage) == 1
    assert "pragma without inline reason" in capsys.readouterr().out


def test_missing_coverage_json_fails_clearly(gate, tmp_path, capsys):
    repo = make_repo(tmp_path, base={"gamedays/service/demo.py": "x = 1\n"})
    assert invoke(gate, repo, tmp_path / "missing.json") == 1
    assert "coverage JSON not found" in capsys.readouterr().out


@pytest.mark.parametrize("raw", ["{", '{"files": 5}', "[1]"])
def test_invalid_coverage_json_fails_clearly(gate, tmp_path, raw, capsys):
    repo = make_repo(tmp_path, base={"gamedays/service/demo.py": "x = 1\n"})
    coverage = write_coverage(tmp_path, {}, raw=raw)
    assert invoke(gate, repo, coverage) == 1
    assert "invalid coverage JSON" in capsys.readouterr().out


def test_shard_only_checks_its_own_functions(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={
            "gamedays/service/demo.py": "def f():\n    return 1\n",
            "officials/service/demo.py": "def g():\n    return 1\n",
        },
        head={
            "gamedays/service/demo.py": "def f():\n    return 2\n",
            "officials/service/demo.py": "def g():\n    return 2\n",
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {"f": function("f", executed=[2])}
            },
            "officials/service/demo.py": {
                "functions": {"g": function("g", executed=[2])}
            },
        },
    )
    assert (
        invoke(
            gate,
            repo,
            coverage,
            "--shard",
            "python-gamedays",
        )
        == 0
    )
    out = capsys.readouterr().out
    assert "1 functions in scope" in out and "officials" not in out


def test_branch_endpoints_put_function_in_scope(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f(x):\n    return x\n"},
        head={"gamedays/service/demo.py": "def f(x):\n    if x:\n        return x\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {"f": function("f", executed=[2], branches=[[2, 3]])}
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "1 functions in scope" in capsys.readouterr().out


def test_deleted_python_file_is_ignored(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/old.py": "def f():\n    return 1\n"},
        head={"gamedays/service/keep.py": "x = 1\n"},
    )
    (repo / "gamedays/service/old.py").unlink()
    coverage = write_coverage(tmp_path, {"gamedays/service/keep.py": {"functions": {}}})
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


def test_pragma_reason_must_not_be_empty(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={
            "gamedays/service/demo.py": (
                "def f():\n    return 1  # pragma: no cover --\n"
            )
        },
    )
    coverage = write_coverage(
        tmp_path,
        {"gamedays/service/demo.py": {"functions": {"f": function("f", executed=[2])}}},
    )
    assert invoke(gate, repo, coverage) == 1
    assert "pragma without inline reason" in capsys.readouterr().out


def test_require_file_skips_files_outside_the_override(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={
            "gamedays/service/a.py": "def f():\n    return 1\n",
            "gamedays/service/b.py": "def g():\n    return 1\n",
        },
        head={
            "gamedays/service/a.py": "def f():\n    return 2\n",
            "gamedays/service/b.py": "def g():\n    return 2\n",
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/a.py": {"functions": {"f": function("f", executed=[2])}},
            "gamedays/service/b.py": {"functions": {"g": function("g", executed=[2])}},
        },
    )
    assert (
        invoke(
            gate,
            repo,
            coverage,
            "--require-file",
            "gamedays/service/a.py",
        )
        == 0
    )
    assert "1 functions in scope" in capsys.readouterr().out


def test_untracked_git_failure_is_tolerated(gate, tmp_path, monkeypatch, capsys):
    repo = make_repo(tmp_path, base={"gamedays/service/demo.py": "x = 1\n"})
    coverage = write_coverage(tmp_path, {})
    real_git = gate.git

    def fake_git(root, *args):
        if args[0] == "ls-files":
            return subprocess.CompletedProcess(args, 1, "", "boom")
        return real_git(root, *args)

    monkeypatch.setattr(gate, "git", fake_git)
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


def test_gate_runs_as_a_script(gate, tmp_path):
    repo = make_repo(tmp_path, base={"gamedays/service/demo.py": "x = 1\n"})
    coverage = write_coverage(tmp_path, {})
    result = subprocess.run(
        [
            sys.executable,
            str(Path(gate.__file__).resolve()),
            "--coverage",
            str(coverage),
            "--base",
            "HEAD",
            "--root",
            str(repo),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "0 functions in scope" in result.stdout


def test_excluded_lines_put_function_in_scope(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={
            "gamedays/service/demo.py": "def f():\n    return 1  # pragma: no cover -- x\n"
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {"f": function("f", executed=[1], excluded=[2])}
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "1 functions in scope" in capsys.readouterr().out


COVERAGERC = """\
[run]
branch = True
omit =
   *manage.py
   */settings.py
   */wsgi.py
   */asgi.py
   */fixtures/*
   */static/*
   */templates/*
   */tests/*
   *apps.py
   */migrations/*
   */urls.py
   *__init__*
"""


@pytest.mark.parametrize(
    "name",
    [
        "gamedays/wsgi.py",
        "gamedays/settings.py",
        "league_manager/asgi.py",
        "gamedays/fixtures/demo.py",
        "gamedays/static/demo.py",
        "gamedays/templates/demo.py",
        "manage.py",
        "conftest.py",
        "test_settings.py",
        ".claude/skills/demo.py",
    ],
)
def test_full_omit_list_and_root_files_are_ignored(gate, tmp_path, name, capsys):
    repo = make_repo(
        tmp_path,
        base={".coveragerc": COVERAGERC},
        head={".coveragerc": COVERAGERC, name: "x = 1\n"},
    )
    coverage = write_coverage(tmp_path, {})
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


def test_import_only_edit_ignores_module_level_branch(gate, tmp_path, capsys):
    """The '' entry owns module-level branches; an import-only edit must not fail."""
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "X = 1\nif X:\n    Y = 2\n"},
        head={"gamedays/service/demo.py": "import os\nX = 1\nif X:\n    Y = 2\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "": {
                        "executed_lines": [1],
                        "missing_lines": [2, 3, 4],
                        "excluded_lines": [],
                        "executed_branches": [],
                        "missing_branches": [[2, 3]],
                    }
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert "0 functions in scope" in capsys.readouterr().out


def test_def_line_only_edit_scopes_the_function(gate, tmp_path, capsys):
    """A changed def line belongs to the function below, not to the '' entry."""
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f(a):\n    if a:\n        return 1\n"},
        head={
            "gamedays/service/demo.py": (
                "def f(a, b=None):\n    if a:\n        return 1\n"
            )
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "f": function(
                        "f", executed=[3], missing_branches=[[2, 3]], start_line=1
                    )
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 1
    out = capsys.readouterr().out
    assert "1 functions in scope" in out
    assert "missing branch" in out


def test_decorator_only_edit_scopes_the_function(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={
            "gamedays/service/demo.py": (
                "def deco(fn):\n    return fn\n\n@deco\ndef f(a):\n"
                "    if a:\n        return 1\n"
            )
        },
        head={
            "gamedays/service/demo.py": (
                "def deco(fn):\n    return fn\n\n@deco\n@deco\ndef f(a):\n"
                "    if a:\n        return 1\n"
            )
        },
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {
                    "deco": function("deco", executed=[2], start_line=1),
                    "f": function(
                        "f", executed=[8], missing_branches=[[7, 8]], start_line=6
                    ),
                }
            }
        },
    )
    assert invoke(gate, repo, coverage) == 1
    assert "f: missing branch" in capsys.readouterr().out


def test_function_without_start_line_is_still_scoped(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f():\n    return 2\n"},
    )
    fn = function("f", executed=[2])
    del fn["start_line"]
    coverage = write_coverage(
        tmp_path, {"gamedays/service/demo.py": {"functions": {"f": fn}}}
    )
    assert invoke(gate, repo, coverage) == 0
    assert "1 functions in scope" in capsys.readouterr().out


def test_unparsable_source_does_not_crash_scope_mapping(gate, tmp_path, capsys):
    repo = make_repo(
        tmp_path,
        base={"gamedays/service/demo.py": "def f():\n    return 1\n"},
        head={"gamedays/service/demo.py": "def f(:\n"},
    )
    coverage = write_coverage(
        tmp_path,
        {
            "gamedays/service/demo.py": {
                "functions": {"f": function("f", executed=[1], start_line=1)}
            }
        },
    )
    assert invoke(gate, repo, coverage) == 0
    assert (
        "1 functions in scope, 1 files, 0 missing branches" in capsys.readouterr().out
    )


def test_real_coverage_json_scopes_changed_def(gate, tmp_path, capsys):
    """A real `coverage run` + `coverage json` exposes both failure modes."""
    pytest.importorskip("coverage")
    repo = make_repo(
        tmp_path,
        base={
            "gamedays/service/demo.py": (
                "def f(a):\n    if a:\n        return 1\n    return 2\n"
            )
        },
        head={
            "gamedays/service/demo.py": (
                "def f(a, b=None):\n    if a:\n        return 1\n    return 2\n"
            )
        },
    )
    caller = tmp_path / "call_demo.py"
    caller.write_text("from gamedays.service.demo import f\nf(1)\n", encoding="utf-8")
    env = {**os.environ, "PYTHONPATH": str(repo)}
    run = subprocess.run(
        [
            sys.executable,
            "-m",
            "coverage",
            "run",
            "--branch",
            "--source=gamedays",
            str(caller),
        ],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert run.returncode == 0, run.stderr
    report = tmp_path / "real-coverage.json"
    subprocess.run(
        [sys.executable, "-m", "coverage", "json", "-o", str(report)],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    real = json.loads(report.read_text(encoding="utf-8"))
    functions = real["files"]["gamedays/service/demo.py"]["functions"]
    assert "" in functions  # coverage.py 7.17 module-level entry
    assert functions["f"]["start_line"] == 1  # the def line is owned by ""
    assert invoke(gate, repo, report) == 1
    assert "f: missing branch" in capsys.readouterr().out
