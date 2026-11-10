#!/usr/bin/env python3
"""Guard: path-scoped CI must never skip a status context.

Why this exists: the branch ruleset can only require a check that is
*created on every push*. CI is path-scoped (see
docs/topics/deployment/scoped-ci.md), and a CircleCI job switched off
with a `filters:` expression publishes no status at all - so a red
scoped suite is invisible to the required checks, and to renovate's
`platformAutomerge`, which waits for required checks only. That is how
@testing-library/user-event 14.6.9 (#2353) reached master with a broken
scorecard_js and only blew up on the release PR (#2356).

The invariant enforced here is structural:

1. No workflow job may be gated by a `filters:` expression. Scoped jobs
   are *always scheduled* and decide inside whether to work, using the
   boolean `needed` job parameter (the pattern `build_backend`,
   `build_frontend` and `test_compose_network` already use). A no-op run
   is cheap and still publishes a green context.
2. A `needed:` entry must reference a declared pipeline parameter, and
   its job definition must declare the boolean `needed` parameter
   (default `true`).
3. `full_gate` fans in every job that runs on tag pipelines, so a deploy
   can never skip part of the matrix - and every job `full_gate` requires
   must itself run on tags, or the gate would be skipped on releases.
4. Every declared `run-*` pipeline parameter must be consumed by at least
   one `needed:` entry (fail closed on a leftover parameter after a
   rename).

Together (1) + (3) make a single required `ci/circleci: full_gate`
context mean "every suite this diff scoped in is green".

Run locally with:  python3 scripts/check_ci_gate.py
CI runs it in the always-on `scope_coverage` job, and the unit tests run
in the `python-cross` shard.
"""

from __future__ import annotations

import re
import sys

CONTINUE_CONFIG = ".circleci/continue.yml"
WORKFLOW = "build_test_deploy"
GATE_JOB = "full_gate"

JOB_DEF_RE = re.compile(r"^ {2}(?P<name>[A-Za-z0-9_-]+):\s*$")
ENTRY_RE = re.compile(r"^ {6}- (?P<name>[A-Za-z0-9_-]+):\s*$")
PARAM_REF_RE = re.compile(r"^<<\s*pipeline\.parameters\.(?P<param>[A-Za-z0-9_-]+)\s*>>$")


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _is_noise(line: str) -> bool:
    stripped = line.strip()
    return not stripped or stripped.startswith("#")


def _find_key(
    lines: list[str], key: str, indent: int, start: int = 0, end: int | None = None
) -> int | None:
    """Return the index of `key:` at exactly `indent`, or None."""
    pad = " " * indent
    for index in range(start, len(lines) if end is None else end):
        line = lines[index]
        if line.startswith(f"{pad}{key}:"):
            rest = line[len(pad) + len(key) + 1 :]
            if rest == "" or rest[0] in " \t":
                return index
    return None


def _block(lines: list[str], index: int, indent: int) -> list[str]:
    """Return the dedented-by-nature lines nested under lines[index]."""
    body: list[str] = []
    for line in lines[index + 1 :]:
        if _is_noise(line):
            body.append(line)
            continue
        if _indent(line) <= indent:
            break
        body.append(line)
    return body


def _scalar(body: list[str], key: str, indent: int) -> str | None:
    """Return the inline scalar of `key:` at `indent` inside a block."""
    index = _find_key(body, key, indent)
    if index is None:
        return None
    line = body[index]
    value = line[len(" " * indent) + len(key) + 1 :].strip()
    return value or None


def pipeline_parameters(text: str) -> dict[str, str]:
    """Return the declared pipeline parameters (name -> type)."""
    lines = text.splitlines()
    start = _find_key(lines, "parameters", 0)
    if start is None:
        return {}
    params: dict[str, str] = {}
    body = _block(lines, start, 0)
    index = 0
    while index < len(body):
        line = body[index]
        if _is_noise(line) or _indent(line) != 2:
            index += 1
            continue
        match = JOB_DEF_RE.match(line)
        if not match:
            index += 1
            continue
        name = match.group("name")
        nested = _block(body, index, 2)
        params[name] = _scalar(nested, "type", 4) or "string"
        index += 1 + len(nested)
    return params


def job_definitions(text: str) -> dict[str, dict[str, bool]]:
    """Return each job definition and whether it declares `needed: boolean`."""
    lines = text.splitlines()
    start = _find_key(lines, "jobs", 0)
    if start is None:
        return {}
    jobs: dict[str, dict[str, bool]] = {}
    body = _block(lines, start, 0)
    index = 0
    while index < len(body):
        line = body[index]
        match = JOB_DEF_RE.match(line)
        if _is_noise(line) or match is None:
            index += 1
            continue
        nested = _block(body, index, 2)
        jobs[match.group("name")] = {
            "needed_param": _declares_needed_boolean(nested),
            "wrapped": _wraps_steps_in_scoped_job(nested),
        }
        index += 1 + len(nested)
    return jobs


def _wraps_steps_in_scoped_job(job_body: list[str]) -> bool:
    """Whether the job's steps go through the `scoped_job` command."""
    index = _find_key(job_body, "steps", 4)
    if index is None:
        return False
    nested = _block(job_body, index, 4)
    if "      - scoped_job:" not in nested:
        return False
    return _scalar(nested, "needed", 10) == "<< parameters.needed >>"


def _declares_needed_boolean(job_body: list[str]) -> bool:
    """Whether the job declares `needed` as a boolean defaulting to true."""
    index = _find_key(job_body, "parameters", 4)
    if index is None:
        return False
    nested = _block(job_body, index, 4)
    needed_at = _find_key(nested, "needed", 6)
    if needed_at is None:
        return False
    declaration = _block(nested, needed_at, 6)
    return (_scalar(declaration, "type", 8) or "").lower() in {"boolean", "bool"} and (
        _scalar(declaration, "default", 8) or ""
    ).lower() == "true"


def workflow_entries(text: str, workflow: str = WORKFLOW) -> list[dict[str, object]]:
    """Return the workflow's job entries with their scheduling metadata."""
    lines = text.splitlines()
    workflows_at = _find_key(lines, "workflows", 0)
    if workflows_at is None:
        return []
    workflow_at = _find_key(lines, workflow, 2, start=workflows_at)
    if workflow_at is None:
        return []
    jobs_at = _find_key(lines, "jobs", 4, start=workflow_at)
    if jobs_at is None:
        return []

    entries: list[dict[str, object]] = []
    index = jobs_at + 1
    while index < len(lines):
        line = lines[index]
        if _is_noise(line):
            index += 1
            continue
        if _indent(line) < 6:
            break
        match = ENTRY_RE.match(line)
        if match is None:
            index += 1
            continue
        body = _block(lines, index, 6)
        entries.append(_parse_entry(match.group("name"), body))
        index += 1 + len(body)
    return entries


def _parse_entry(name: str, body: list[str]) -> dict[str, object]:
    """Extract `needed`, filters and `requires` from one workflow entry."""
    needed = _scalar(body, "needed", 10)
    requires: list[str] = []

    filters_at = _find_key(body, "filters", 10)
    expression = None
    tags_opt_in = False
    tag_only = False
    if filters_at is not None:
        inline = body[filters_at][len(" " * 10) + len("filters:") :].strip()
        if inline:
            expression = inline
        else:
            nested = _block(body, filters_at, 10)
            tags_at = _find_key(nested, "tags", 12)
            if tags_at is not None:
                tags_opt_in = _scalar(_block(nested, tags_at, 12), "only", 14) is not None
            branches_at = _find_key(nested, "branches", 12)
            if branches_at is not None:
                tag_only = (
                    _scalar(_block(nested, branches_at, 12), "ignore", 14) is not None
                )

    requires_at = _find_key(body, "requires", 10)
    if requires_at is not None:
        for line in _block(body, requires_at, 10):
            if _is_noise(line):
                continue
            item = line.strip()
            if item.startswith("- "):
                requires.append(item[2:].strip())

    return {
        "name": name,
        "needed": needed,
        "expression": expression,
        "tags_opt_in": tags_opt_in,
        "tag_only": tag_only,
        "requires": requires,
    }


def check(continue_text: str) -> list[str]:
    """Return every violation of the reporting/gate invariant."""
    errors: list[str] = []
    params = pipeline_parameters(continue_text)
    jobs = job_definitions(continue_text)
    entries = workflow_entries(continue_text)
    if not entries:
        return [f"{CONTINUE_CONFIG}: no `{WORKFLOW}` workflow jobs found - failing closed"]

    consumed_params: set[str] = set()
    gate: dict[str, object] | None = None

    for entry in entries:
        name = entry["name"]
        assert isinstance(name, str)
        if name == GATE_JOB:
            gate = entry

        if entry["expression"]:
            errors.append(
                f"{name}: gated by a `filters:` expression "
                f"({entry['expression']}) - a filtered-out job publishes no "
                "status, so a required check can never see it. Use the "
                "`needed:` job parameter instead."
            )

        needed = entry["needed"]
        if needed:
            if not entry["tags_opt_in"]:
                errors.append(
                    f"{name}: a `needed:` job must also run on tag pipelines "
                    "(`filters: tags: only: /.*/`) - a release resolves to a "
                    "full run"
                )
            match = PARAM_REF_RE.match(str(needed))
            if not match:
                errors.append(
                    f"{name}: `needed:` must be "
                    "`<< pipeline.parameters.<run-param> >>`, got "
                    f"{needed!r}"
                )
            else:
                param = match.group("param")
                consumed_params.add(param)
                if param not in params:
                    errors.append(
                        f"{name}: `needed:` references undeclared pipeline "
                        f"parameter {param!r}"
                    )
            job = jobs.get(name)
            if job is None:
                errors.append(f"{name}: no job definition found")
            elif not job["needed_param"]:
                errors.append(
                    f"{name}: job definition must declare a boolean `needed` "
                    "parameter (default: true) - it decides inside whether to "
                    "do the work, so the status context always reports"
                )
            elif not job["wrapped"]:
                errors.append(
                    f"{name}: steps must be wrapped in the `scoped_job` "
                    "command with `needed: << parameters.needed >>`, or the "
                    "job does the full work on every push"
                )

    if gate is None:
        errors.append(f"{GATE_JOB}: missing from the `{WORKFLOW}` workflow")
        return errors

    if gate["expression"]:
        errors.append(
            f"{GATE_JOB}: must never be path-gated, or a branch pipeline "
            "loses its terminal required context"
        )
    if not gate["tags_opt_in"]:
        errors.append(
            f"{GATE_JOB}: must opt in to tag pipelines (`filters: tags: only: /.*/`), "
            "or releases cannot require it"
        )

    requires = [str(item) for item in gate["requires"]]
    by_name = {str(entry["name"]): entry for entry in entries}

    for required in requires:
        entry = by_name.get(required)
        if entry is None:
            errors.append(f"{GATE_JOB}: requires {required!r}, which is not a job")
        elif not entry["tags_opt_in"]:
            errors.append(
                f"{GATE_JOB}: requires {required!r}, which does not run on tag "
                "pipelines - on releases the gate would be skipped and the "
                "deploy would wait forever"
            )

    for entry in entries:
        name = str(entry["name"])
        if name == GATE_JOB or entry["tag_only"]:
            continue
        if entry["tags_opt_in"] and name not in requires:
            errors.append(
                f"{name}: runs on tag pipelines but is not fanned in by "
                f"{GATE_JOB}.requires - a release could skip it"
            )

    for param in params:
        if param.startswith("run-") and param not in consumed_params:
            errors.append(
                f"pipeline parameter {param!r} is declared but no workflow job "
                "passes it via `needed:` - a dead scope parameter runs nothing"
            )

    return errors


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
        print(f"check_ci_gate FAILED: cannot read {CONTINUE_CONFIG}")
        return 1

    errors = check(continue_text)
    if errors:
        print("check_ci_gate FAILED:")
        for line in errors:
            print(f"  - {line}")
        return 1

    entries = workflow_entries(continue_text)
    gate = next(entry for entry in entries if entry["name"] == GATE_JOB)
    print(
        f"check_ci_gate OK: no path-gated job, {len(gate['requires'])} jobs "
        f"fanned in by {GATE_JOB}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
