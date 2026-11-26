#!/usr/bin/env python3
"""Fail a diff when any changed function has an uncovered branch.

Phase 1 (#2537) inverts imports behind registries. A test can still pass
while a newly added branch in a changed function is untested, so each Python
shard runs this gate against the coverage JSON produced by its own pytest run.

Scope: changed/new Python files (minus every .coveragerc omission; repo-root
and .claude/** files are ignored). A function is in scope when one of its
lines — including its def/decorator head, which coverage.py's "" entry owns —
was added, or when its file is new. Ownership maps every app to the one shard
that may judge it.

Stdlib only: the gate runs on cimg/python in CircleCI with no uv installed.

    python3 scripts/check_branch_coverage.py \
        --coverage coverage.json --base origin/master --shard python-gamedays

    # before a move, verify the original functions reach 100%:
    python3 scripts/check_branch_coverage.py --coverage coverage-original.json \
        --base HEAD --require-file gamedays/service/demo.py \
        --require-function demo.function
"""

from __future__ import annotations

import argparse
import ast
import configparser
import fnmatch
import json
import pathlib
import re
import subprocess
import sys

OWNERS = (
    (("gamedays", "league_table", "gameevents"), "python-gamedays"),
    (("officials", "teammanager", "accounts"), "python-officials"),
    (("liveticker", "scorecard", "scorecard_v2"), "python-live"),
    (("passcheck", "gameday_designer", "journey", "matchreport"), "python-designer"),
    (("league_manager", "home", "dbaccess", "share"), "python-core"),
    (("scripts", "tests"), "python-cross"),
)
PRAGMA = re.compile(r"#\s*pragma:\s*(no branch|no cover)\b(?P<reason>.*)$", re.I)
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


def git(root, *args):
    """Run a git command without raising; callers inspect returncode."""
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, check=False
    )


def merge_base(root, base):
    result = git(root, "merge-base", base, "HEAD")
    if result.returncode == 0:
        return result.stdout.strip()
    print(f"git merge-base {base} HEAD failed; treating {base} as the base")
    return base


def changed_files(root, base):
    """Return (tracked changes, untracked new files) as sets of paths."""
    diff = git(root, "diff", "--name-only", base, "--")
    changed = set()
    if diff.returncode == 0:
        changed.update(diff.stdout.splitlines())
    else:
        print(f"git diff --name-only {base} failed; using untracked files only")
    untracked = git(root, "ls-files", "--others", "--exclude-standard")
    new = set()
    if untracked.returncode == 0:
        new.update(untracked.stdout.splitlines())
    return changed, new


def omit_patterns(root):
    """Read every omission pattern from .coveragerc, not a hand-picked subset."""
    config = configparser.ConfigParser()
    config.read(root / ".coveragerc")
    patterns = []
    for section in ("run", "report"):
        if config.has_option(section, "omit"):
            patterns.extend(
                line.strip()
                for line in config.get(section, "omit").splitlines()
                if line.strip()
            )
    return patterns


def is_omitted(root, path):
    """Mirror all .coveragerc omissions; ignore root files and .claude/**.

    Repo-root ``*.py`` and ``.claude/**.py`` have no shard owner — a PR
    touching conftest.py or a skill script must not fail every shard's gate.
    """
    if path.startswith(".claude/") or "/" not in path:
        return True
    return any(fnmatch.fnmatch(path, pattern) for pattern in omit_patterns(root))


def function_spans(text, functions):
    """Line spans that scope each coverage function.

    coverage.py 7.17 puts module-level code *and every def/decorator line* in
    the ``""`` function, so the function's own ``start_line`` (the def) and
    its decorator lines are not in ``function_lines``. Parse the file's AST
    to attach those head lines to the function below them; a def- or
    decorator-only edit must scope that function, not be silently ignored.
    """
    spans = {}
    for name, fn in functions.items():
        if not name:
            continue
        lines = function_lines(fn)
        if fn.get("start_line"):
            lines.add(fn["start_line"])
        spans[name] = lines
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return spans
    by_start = {}
    for name, fn in functions.items():
        if name and fn.get("start_line"):
            by_start.setdefault(fn["start_line"], []).append(name)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        names = by_start.get(node.lineno, [])
        if not names:
            continue
        head = min(
            [decorator.lineno for decorator in node.decorator_list] or [node.lineno]
        )
        end = getattr(node, "end_lineno", None) or node.lineno
        for name in names:
            spans[name].update(range(head, end + 1))
    return spans


def scoped_functions(spans, added):
    """Map each added line to the innermost function whose span contains it."""
    scoped = set()
    for line in added:
        candidates = [name for name, lines in spans.items() if line in lines]
        if candidates:
            scoped.add(min(candidates, key=lambda name: len(spans[name])))
    return scoped


def owner_for(path):
    top = path.split("/", 1)[0]
    for prefixes, shard in OWNERS:
        if top in prefixes:
            return shard
    return None


def added_lines(root, base, path):
    """Line numbers added by the diff (unified=0, so no context lines)."""
    result = git(root, "diff", "--unified=0", base, "--", path)
    lines = set()
    current = 0
    for line in result.stdout.splitlines():
        header = HUNK.match(line)
        if header:
            current = int(header.group(1))
        elif line.startswith("+") and not line.startswith("+++"):
            lines.add(current)
            current += 1
    return lines


def load_coverage(path):
    if not path.exists():
        print(f"coverage JSON not found: {path}")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"invalid coverage JSON: {error}")
        return None
    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        print("invalid coverage JSON: expected an object with a 'files' object")
        return None
    return data["files"]


def function_lines(fn):
    lines = set(fn.get("executed_lines", []))
    lines.update(fn.get("missing_lines", []))
    lines.update(fn.get("excluded_lines", []))
    for key in ("executed_branches", "missing_branches"):
        for pair in fn.get(key, []):
            lines.update(pair)
    return lines


def check_pragmas(path, text):
    """Print and validate every pragma in an in-scope file."""
    ok = True
    for number, line in enumerate(text.splitlines(), 1):
        match = PRAGMA.search(line)
        if not match:
            continue
        reason = match.group("reason").strip()
        if reason.startswith("--") and reason[2:].strip():
            print(f"{path}:{number}: pragma {match.group(1)} -- {reason[2:].strip()}")
        else:
            print(f"{path}:{number}: pragma without inline reason (add '-- reason')")
            ok = False
    return ok


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--coverage", required=True, help="coverage.py JSON report")
    parser.add_argument("--base", default="origin/master", help="base ref or SHA")
    parser.add_argument("--shard", default="", help="only judge this shard's files")
    parser.add_argument("--root", default=".", help="repository root (default: cwd)")
    parser.add_argument(
        "--require-file", action="append", default=[], help="scope override: file"
    )
    parser.add_argument(
        "--require-function", action="append", default=[], help="scope override: fn"
    )
    args = parser.parse_args(argv)

    coverage = load_coverage(pathlib.Path(args.coverage))
    if coverage is None:
        return 1

    root = pathlib.Path(args.root).resolve()
    base = merge_base(root, args.base)
    changed, new = changed_files(root, base)

    failed = False
    scope = {}
    forced = set(args.require_file)
    for path in sorted(changed | new | forced):
        if not path.endswith(".py") or is_omitted(root, path):
            continue
        shard = owner_for(path)
        if shard is None:
            print(f"{path}: unmapped changed .py file -- add an ownership mapping")
            failed = True
            continue
        if args.shard and shard != args.shard:
            continue
        if args.require_file and path not in args.require_file:
            continue
        source = root / path
        if not source.exists():
            continue  # deleted file
        if path not in coverage:
            print(f"{path}: no branch data (import it from a test to scope it)")
            failed = True
            continue
        source_text = source.read_text(encoding="utf-8")
        if not check_pragmas(path, source_text):
            failed = True

        functions = coverage[path].get("functions", {})
        all_functions = path in new or path in forced
        added = set() if all_functions else added_lines(root, base, path)
        spans = function_spans(source_text, functions)
        in_scope = scoped_functions(spans, added)
        for name, fn in functions.items():
            if not name:  # the "" entry owns module-level code and def heads
                continue
            if args.require_function and name not in args.require_function:
                continue
            if not all_functions and name not in in_scope:
                continue
            scope.setdefault(path, []).append((name, fn))

    missing = 0
    for path, functions in scope.items():
        for name, fn in functions:
            for pair in fn.get("missing_branches", []):
                missing += 1
                print(f"{path}: {name}: missing branch " f"{pair[0]}->{pair[1]}")
                failed = True

    count = sum(len(functions) for functions in scope.values())
    print(f"{count} functions in scope, {len(scope)} files, {missing} missing branches")
    return 1 if failed else 0


if (
    __name__ == "__main__"
):  # pragma: no cover -- CLI entrypoint exercised via subprocess
    sys.exit(main())
