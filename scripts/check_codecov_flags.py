#!/usr/bin/env python3
"""Guard: every Codecov flag CI uploads must carry forward.

Why this exists: CI is path-scoped (see
docs/topics/deployment/scoped-ci.md). A PR confined to one app runs only
that app's shard(s) and skips the rest, so on that commit only some
Codecov flags get a fresh upload. Codecov expects a report per flag per
commit; without ``carryforward`` it drops the files exclusive to the
missing flags from the project comparison, and ``codecov/project``
falsely fails with a large apparent drop (dachrisch/leaguesphere#2015).

This fails closed (exit 1) unless every flag extracted from
``.circleci/continue.yml`` (shard ``cov_flag`` values and frontend
``flags:`` uploads) is carryforward-enabled in ``.codecov.yml``, either
via ``flag_management.default_rules.carryforward: true`` or an explicit
per-flag ``carryforward: true``.

Only the YAML subset used by these two files is parsed (nested mappings,
scalar values, comments); lists such as ``ignore:`` are skipped. Run it
locally with:  python3 scripts/check_codecov_flags.py
"""

from __future__ import annotations

import re
import sys

CONTINUE_CONFIG = ".circleci/continue.yml"
CODECOV_FILE = ".codecov.yml"

# Shard jobs pass their flag through the shared python_shard_test command
# as a quoted `cov_flag: "python-core"` value. The bare `cov_flag:` key in
# the command's parameter block has no inline value and never matches.
COV_FLAG_RE = re.compile(r'cov_flag:[ \t]+"?(?P<flag>[A-Za-z0-9_.-]+)"?')

# Frontend jobs upload with a literal `flags: scorecard`. The shared
# command's `flags: << parameters.cov_flag >>` template has no literal
# token, so it is not matched.
UPLOAD_FLAG_RE = re.compile(
    r"^[ \t]+flags:[ \t]+(?P<flag>[A-Za-z0-9_.-]+)[ \t]*$", re.MULTILINE
)

_TRUE_VALUES = {"true", "yes"}


def extract_ci_flags(continue_text: str) -> list[str]:
    """Return every Codecov flag CI uploads, in first-seen order."""
    flags: list[str] = []
    for match in COV_FLAG_RE.finditer(continue_text):
        flags.append(match.group("flag"))
    for match in UPLOAD_FLAG_RE.finditer(continue_text):
        flags.append(match.group("flag"))
    return list(dict.fromkeys(flags))


def lookup_scalar(text: str, dotted_key: str) -> str | None:
    """Return the scalar at a dotted key of an indented YAML mapping.

    Ignores blank lines, comments, and list items (``- ...``). Returns
    ``None`` when the key is absent or its value is a nested block.
    """
    path = dotted_key.split(".")
    stack: list[tuple[int, str]] = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("-"):
            continue
        indent = len(raw) - len(raw.lstrip())
        key, sep, value = stripped.partition(":")
        if not sep:
            continue
        key = key.strip()
        value = value.strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        node = [name for _, name in stack] + [key]
        if value == "":
            stack.append((indent, key))
        elif node == path:
            return value
    return None


def _is_true(value: str | None) -> bool:
    return value is not None and value.strip().lower() in _TRUE_VALUES


def flag_is_carryforward(flag: str, codecov_text: str) -> bool:
    """Whether ``flag`` reuses its last coverage when its shard is skipped."""
    explicit = lookup_scalar(codecov_text, f"flags.{flag}.carryforward")
    if explicit is not None:
        return _is_true(explicit)
    default = lookup_scalar(codecov_text, "flag_management.default_rules.carryforward")
    return _is_true(default)


def missing_carryforward(ci_flags: list[str], codecov_text: str) -> list[str]:
    """Return CI flags that are not carryforward-enabled in ``.codecov.yml``."""
    return [flag for flag in ci_flags if not flag_is_carryforward(flag, codecov_text)]


def _read(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


def main(argv: list[str] | None = None) -> int:
    _ = argv
    continue_text = _read(CONTINUE_CONFIG)
    if continue_text is None:
        print(f"check_codecov_flags FAILED: cannot read {CONTINUE_CONFIG}")
        return 1
    codecov_text = _read(CODECOV_FILE)
    if codecov_text is None:
        print(f"check_codecov_flags FAILED: cannot read {CODECOV_FILE}")
        return 1

    ci_flags = extract_ci_flags(continue_text)
    if not ci_flags:
        print(
            "check_codecov_flags FAILED: no Codecov flags found in "
            f"{CONTINUE_CONFIG} - failing closed"
        )
        return 1

    missing = missing_carryforward(ci_flags, codecov_text)
    if missing:
        print("check_codecov_flags FAILED: flags missing carryforward: true in")
        print(f"  {CODECOV_FILE} ({len(missing)}/{len(ci_flags)} flags):")
        for flag in missing:
            print(f"  - {flag}")
        return 1

    print(
        f"check_codecov_flags OK: all {len(ci_flags)} CI flags carry forward "
        f"({', '.join(ci_flags)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
