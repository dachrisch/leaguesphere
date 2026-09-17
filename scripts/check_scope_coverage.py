#!/usr/bin/env python3
"""Safety net for scoped CI: every tracked path must have a scope rule.

Why this exists: CircleCI runs a `scope` (path-filtering) job that only
runs the jobs affected by a change. Without a guard, a new directory or
file type could silently match *no* mapping rule and skip all tests.

This script fails closed (exit 1) unless every `git ls-files` path
matches at least one rule:

- a *job* regex from `.circleci/scope-mapping.txt` (3-column
  `<regex> <param> <value>` rules, passed to the path-filtering orb —
  the single source of truth for job triggers), or
- an *ignore* regex from `.circleci/scope-exclude.txt` (explicitly
  reviewed paths that need no CI: markdown docs, manual scripts,
  legacy/dead code, VCS and editor metadata).

It also validates the mapping itself: every regex must compile, every
mapped pipeline parameter must be declared in `.circleci/continue.yml`,
and every ignore pattern must match at least one tracked file (so stale
ignores are pruned instead of accumulating).

Run locally with:  python3 scripts/check_scope_coverage.py
CI runs it as the always-on `scope-coverage` job (never path-scoped).
"""

from __future__ import annotations

import re
import subprocess
import sys

SETUP_CONFIG = ".circleci/config.yml"
CONTINUE_CONFIG = ".circleci/continue.yml"

# Single source of truth, shared with the CircleCI path-filtering orb:
# the setup config passes both files by path (the orb loads file
# contents when the parameter value is a file).
SCOPE_MAPPING_FILE = ".circleci/scope-mapping.txt"
SCOPE_EXCLUDE_FILE = ".circleci/scope-exclude.txt"

# Docs never affect builds or tests, so they short-circuit before job
# rules: a broad `<app>/.*` job rule must not claim `CLAUDE.md` edits.
# (Mirrored in SCOPE_EXCLUDE_FILE, which is authoritative for CI; this
# constant only documents the intent for readers of this script.)
DOC_ALWAYS_IGNORE = [
    r".*\.md",
    r"docs/.*",
]


def read_rules_file(path: str) -> list[str]:
    """Read one-pattern-per-line (orb `exclude:` parity: skip blanks)."""
    patterns: list[str] = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            patterns.append(stripped)
    return patterns


def read_mapping_file(path: str) -> list[tuple[str, str, str]]:
    """Read 3-column mapping rules (orb `mapping:` parity)."""
    with open(path, encoding="utf-8") as handle:
        return parse_mapping_text(handle.read())


def parse_mapping_text(text: str) -> list[tuple[str, str, str]]:
    """Parse 3-column `<regex> <param> <value>` rules (orb parity).

    Blank lines and `#` comments are skipped, mirroring the orb's
    `is_mapping_line`. Anything else must be exactly 3 columns.
    """
    entries: list[tuple[str, str, str]] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = stripped.split()
        if len(parts) != 3:
            raise ValueError(
                f"bad mapping line {lineno}: {line!r} "
                f"(expected `<regex> <param> <value>`, got {len(parts)} columns)"
            )
        entries.append((parts[0], parts[1], parts[2]))
    return entries


def extract_mapping(config_text: str) -> list[tuple[str, str, str]]:
    """Parse the `mapping: |` block of a setup config (legacy helper).

    Production mapping lives in SCOPE_MAPPING_FILE; this stays for
    backward-compatible testing of inline mappings.
    """
    lines = config_text.splitlines()
    block: list[str] = []
    in_block = False
    key_indent = 0
    for line in lines:
        stripped = line.strip()
        if not in_block:
            if re.match(r"mapping:\s*\|", stripped):
                in_block = True
                key_indent = len(line) - len(line.lstrip())
            continue
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if indent <= key_indent:
            break  # next YAML key ends the literal block
        parts = stripped.split()
        if len(parts) < 3:
            continue
        block.append(stripped)
    return parse_mapping_text("\n".join(block))


def compile_rules(
    entries: list[tuple[str, str, str]],
) -> list[tuple[re.Pattern[str], str, str]]:
    """Compile rule regexes (full-match semantics like the orb)."""
    compiled = []
    for regex, param, value in entries:
        try:
            compiled.append((re.compile(rf"^(?:{regex})$"), param, value))
        except re.error as exc:
            raise ValueError(f"bad scope regex {regex!r}: {exc}") from exc
    return compiled


def classify(
    path: str,
    job_rules: list[tuple[re.Pattern[str], str, str]],
    ignore_rules: list[tuple[re.Pattern[str], str, str]],
    doc_rules: list[tuple[re.Pattern[str], str, str]] | None = None,
) -> str | None:
    """Return 'job' / 'ignore' / None for a tracked path."""
    for pattern, _, _ in doc_rules or []:
        if pattern.match(path):
            return "ignore"
    for pattern, _, _ in job_rules:
        if pattern.match(path):
            return "job"
    for pattern, _, _ in ignore_rules:
        if pattern.match(path):
            return "ignore"
    return None


def find_uncovered(
    files: list[str],
    job_rules: list[tuple[re.Pattern[str], str, str]],
    ignore_rules: list[tuple[re.Pattern[str], str, str]],
    doc_rules: list[tuple[re.Pattern[str], str, str]] | None = None,
) -> list[str]:
    """Return tracked files matching neither job nor ignore rules."""
    return [f for f in files if classify(f, job_rules, ignore_rules, doc_rules) is None]


def extract_parameters(continue_text: str) -> set[str]:
    """Read pipeline parameter names from the continuation config."""
    params: set[str] = set()
    lines = continue_text.splitlines()
    in_params = False
    params_indent: int | None = None
    for line in lines:
        stripped = line.strip()
        if not in_params:
            if re.match(r"parameters:\s*$", stripped):
                in_params = True
                params_indent = None
            continue
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if params_indent is None:
            if indent == 0:
                break
            params_indent = indent
        if indent < params_indent:
            break
        if indent == params_indent and re.match(r"[A-Za-z0-9_-]+:\s*$", stripped):
            params.add(stripped[:-1])
    return params


def check_mapping_params(
    entries: list[tuple[str, str, str]], known_params: set[str]
) -> list[str]:
    """Flag mapped params not declared in the continuation config."""
    return [
        f"{param!r} (from mapping regex {regex!r}) "
        f"is not declared in {CONTINUE_CONFIG}"
        for regex, param, _ in entries
        if param not in known_params
    ]


def tracked_files() -> list[str] | None:
    """Return `git ls-files` paths, or None when git fails."""
    try:
        result = subprocess.run(
            ["git", "ls-files"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return [line for line in result.stdout.splitlines() if line]


def _read(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


def main(argv: list[str] | None = None) -> int:
    _ = argv
    try:
        entries = read_mapping_file(SCOPE_MAPPING_FILE)
    except OSError:
        print(f"check_scope_coverage FAILED: cannot read {SCOPE_MAPPING_FILE}")
        return 1
    except ValueError as exc:
        print(f"check_scope_coverage FAILED: {SCOPE_MAPPING_FILE}: {exc}")
        return 1
    try:
        ignore_patterns = read_rules_file(SCOPE_EXCLUDE_FILE)
    except OSError:
        print(f"check_scope_coverage FAILED: cannot read {SCOPE_EXCLUDE_FILE}")
        return 1
    continue_text = _read(CONTINUE_CONFIG)
    if continue_text is None:
        print(f"check_scope_coverage FAILED: cannot read {CONTINUE_CONFIG}")
        return 1
    try:
        job_rules = compile_rules(entries)
    except ValueError as exc:
        print(f"check_scope_coverage FAILED: {exc}")
        return 1
    if not job_rules:
        print(
            "check_scope_coverage FAILED: no mapping rules found in "
            f"{SCOPE_MAPPING_FILE} - failing closed"
        )
        return 1
    doc_rules = compile_rules(
        [(pattern, "ignore", "ignore") for pattern in DOC_ALWAYS_IGNORE]
    )
    try:
        ignore_rules = compile_rules(
            [(pattern, "ignore", "ignore") for pattern in ignore_patterns]
        )
    except ValueError as exc:
        print(f"check_scope_coverage FAILED: {SCOPE_EXCLUDE_FILE}: {exc}")
        return 1

    errors: list[str] = []
    errors.extend(check_mapping_params(entries, extract_parameters(continue_text)))

    files = tracked_files()
    if files is None:
        print("check_scope_coverage FAILED: `git ls-files` failed - failing closed")
        return 1
    uncovered = find_uncovered(files, job_rules, ignore_rules, doc_rules)
    for path in uncovered:
        errors.append(
            f"{path}: matches no scope rule - add a job regex to "
            f"{SCOPE_MAPPING_FILE} or an explicit pattern to "
            f"{SCOPE_EXCLUDE_FILE}"
        )
    for pattern in ignore_patterns:
        compiled = re.compile(rf"^(?:{pattern})$")
        if not any(compiled.match(f) for f in files):
            errors.append(
                f"ignore pattern {pattern!r} matches no tracked file - "
                f"prune it from {SCOPE_EXCLUDE_FILE}"
            )

    if errors:
        print("check_scope_coverage FAILED:")
        for line in errors:
            print(f"  - {line}")
        return 1
    print(
        f"check_scope_coverage OK: {len(files)} tracked files covered by "
        f"{len(job_rules)} job rules + {len(ignore_rules) + len(doc_rules)} "
        f"ignore rules"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
