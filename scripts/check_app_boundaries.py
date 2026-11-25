#!/usr/bin/env python3
"""Guard: `gamedays` must not import its consumer apps.

Why this exists (dachrisch/leaguesphere#2536): `gamedays` is the core
domain app, but 15 of its modules import the apps that consume it -
`league_table` above all, then `gameevents`, `gameday_designer`,
`officials`, `passcheck` and `liveticker`. That inverted edge is the
root cause of shotgun changes across the project, and Phase 1 inverts
it. Until then this check freezes *new* back-edges.

Rules:

- Walk `gamedays/**/*.py`, skipping `tests/`, `migrations/`,
  `test_*.py` and `*_test.py`.
- Collect `import` / `from ... import ...` statements whose top-level
  module is one of the six consumer apps.
- `gameevents` is **allowed** by decision (it writes gamedays projection
  tables through its projector boundary), so it is reported but never
  fails and is never listed in the allowlist; every other match must
  have an entry keyed by `<repo-relative path>|<normalised statement>`.
- Unknown imports fail. **Stale** entries fail too, so the allowlist can
  only shrink as Phase 1 removes imports.

The two schema-level FKs (`Gameinfo.league_group`,
`Gameinfo.official`) are string references, not imports: they are kept
by decision and documented in the allowlist header, not modelled here.

Stdlib only (`ast`, `argparse`, `pathlib`, `sys`): the always-on
`scope_coverage` CircleCI job runs this on `cimg/python` with no uv and
no project dependencies installed.

Run locally with:  python3 scripts/check_app_boundaries.py --root .
Regenerate the allowlist with:
  python3 scripts/check_app_boundaries.py --generate --root . \
      --allowlist scripts/app_boundary_allowlist.txt
"""

from __future__ import annotations

import argparse
import ast
from pathlib import Path
import sys

BOUNDARY_MODULES = (
    "league_table",
    "gameevents",
    "gameday_designer",
    "officials",
    "passcheck",
    "liveticker",
)
ALLOWED_MODULES = ("gameevents",)
REPORTED_MODULES = tuple(
    module for module in BOUNDARY_MODULES if module not in ALLOWED_MODULES
)
PACKAGE = "gamedays"
DEFAULT_ALLOWLIST = Path(__file__).resolve().parent / "app_boundary_allowlist.txt"

HEADER = """\
# gamedays dependency boundary allowlist (Phase 0a, dachrisch/leaguesphere#2536).
#
# One entry per line: <repo-relative path>|<normalised import statement>
# followed by an optional "  # <tag>".
#
# gamedays may not import these consumer apps:
#   league_table, gameday_designer, officials, passcheck, liveticker
# gameevents is allowed by decision (projector boundary): it is reported
# but never listed here, so this file can only shrink.
#
# Stale entries fail the check: when Phase 1 inverts an import, delete the
# entry in the same change instead of letting the list grow back.
#
# Kept by decision, not modelled here (string FK references, not imports):
#   gamedays/models.py: Gameinfo.league_group -> "league_table.LeagueGroup"
#   gamedays/models.py: Gameinfo.official -> "officials.Official"
"""


def normalise(node):
    """Return a whitespace/line-continuation independent statement text."""
    if isinstance(node, ast.ImportFrom):
        module = "." * node.level + (node.module or "")
        names = sorted(
            alias.name if alias.asname is None else f"{alias.name} as {alias.asname}"
            for alias in node.names
        )
        return f"from {module} import {', '.join(names)}"

    names = sorted(
        alias.name if alias.asname is None else f"{alias.name} as {alias.asname}"
        for alias in node.names
    )
    return f"import {', '.join(names)}"


def boundary_modules(node):
    """Top-level modules of `node` that sit on the forbidden boundary."""
    if isinstance(node, ast.ImportFrom):
        if node.level:
            return []
        top_level = (node.module or "").split(".")[0]
        return [top_level] if top_level in BOUNDARY_MODULES else []
    return [
        alias.name.split(".")[0]
        for alias in node.names
        if alias.name.split(".")[0] in BOUNDARY_MODULES
    ]


def is_scanned(relative_path):
    parts = relative_path.parts
    if "tests" in parts or "migrations" in parts:
        return False
    name = relative_path.name
    return not (name.startswith("test_") or name.endswith("_test.py"))


def scan(root):
    """Return (entries, counts, files).

    `entries` maps `<path>|<statement>` to the boundary module, for every
    forbidden module. All matches (including gameevents) are counted in
    `counts`; `files` counts files with at least one statement.
    """
    package_root = root / PACKAGE
    entries = {}
    counts = {module: 0 for module in BOUNDARY_MODULES}
    files = 0

    paths = sorted(package_root.rglob("*.py")) if package_root.is_dir() else []
    for path in paths:
        relative_path = path.relative_to(root)
        if not is_scanned(relative_path):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as error:  # fail closed on unparsable code
            raise SystemExit(f"{relative_path}: cannot parse: {error}") from error

        found_in_file = 0
        for node in ast.walk(tree):
            if not isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            modules = boundary_modules(node)
            if not modules:
                continue
            statement = f"{relative_path.as_posix()}|{normalise(node)}"
            for module in modules:
                counts[module] += 1
            entries[statement] = modules[0]
            found_in_file += 1
        if found_in_file:
            files += 1

    return entries, counts, files


def read_allowlist(path):
    allowed = set()
    if not path.exists():
        return allowed
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        allowed.add(line.split("  # ", 1)[0].strip())
    return allowed


def describe(key):
    path, _, statement = key.partition("|")
    return f"  {path}: {statement}"


def tag_for(relative_path):
    if relative_path == "gamedays/service/signals.py":
        return "Phase 1 — scheduling registry"
    if relative_path == "gamedays/views.py":
        return "Phase 1 — detail context"
    if relative_path.startswith("gamedays/api/"):
        return "Phase 1 — API context"
    return "Phase 1 — service inversion"


def summary(counts, files):
    detail = ", ".join(f"{module}={counts[module]}" for module in BOUNDARY_MODULES)
    total = sum(counts.values())
    return f"{files} files, {total} statements: {detail}"


def generate(root, allowlist):
    entries, counts, files = scan(root)
    lines = [line for line in entries if entries[line] not in ALLOWED_MODULES]
    allowlist.parent.mkdir(parents=True, exist_ok=True)
    body = [HEADER]
    for key in sorted(lines, key=lambda item: (item.split("|", 1)[0], item.lower())):
        path = key.split("|", 1)[0]
        body.append(f"{key}  # {tag_for(path)}\n")
    allowlist.write_text("".join(body), encoding="utf-8")

    print(summary(counts, files))
    print(f"{len(lines)} entries written (gameevents allowed, not listed)")
    return 0


def check(root, allowlist):
    entries, counts, files = scan(root)
    reported = {key for key, module in entries.items() if module not in ALLOWED_MODULES}
    allowed = read_allowlist(allowlist)

    unknown = sorted(reported - allowed)
    stale = sorted(allowed - reported)
    if not unknown and not stale:
        print(
            f"OK: {summary(counts, files)} "
            f"(gameevents allowed, {len(reported)} allowlisted)"
        )
        return 0

    if unknown:
        print(
            f"Unknown boundary imports in {PACKAGE}/ "
            "(invert them, or add them to "
            f"{allowlist.name if allowlist else 'the allowlist'}):"
        )
        for key in unknown:
            print(describe(key))
    if stale:
        print(
            "Stale allowlist entries (no matching import; delete them, "
            "the list may only shrink):"
        )
        for key in stale:
            print(describe(key))
    return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--root",
        default=".",
        help="repository root to scan (default: current directory)",
    )
    parser.add_argument(
        "--allowlist",
        default=str(DEFAULT_ALLOWLIST),
        help=f"allowlist file (default: {DEFAULT_ALLOWLIST})",
    )
    parser.add_argument(
        "--generate",
        action="store_true",
        help="rewrite the allowlist from the current imports instead of checking",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    allowlist = Path(args.allowlist)
    if not allowlist.is_absolute():
        allowlist = (Path.cwd() / allowlist).resolve()

    if args.generate:
        return generate(root, allowlist)
    return check(root, allowlist)


if __name__ == "__main__":
    sys.exit(main())
