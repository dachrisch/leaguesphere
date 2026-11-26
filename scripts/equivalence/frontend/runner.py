#!/usr/bin/env python3
"""Frontend journey equivalence runner (Phase 3 Layer 1, #2539).

Runs the same six Playwright journeys against the two agent-stage sides and
diffs a normalised record of every step: ordered API requests (path + body
*shape*, never values) plus visible text and an ARIA snapshot. Reports are
redacted the same way as the backend HTML/API report and can be posted to the
stack PRs with ``gh pr comment``.

No journey is trusted before the ref-vs-ref noise floor passes with all four
role credentials present. Phase 3 declares no intended diffs (roadmap decision
7): the runner exits non-zero on any unexplained diff, skipped step, harness
error or journey that captured fewer than ``--min-steps`` steps.

Usage::

    python3 scripts/equivalence/frontend/runner.py \
        --ref https://ref.example --cand https://cand.example \
        --username "$LS_AGENT_BASIC_USER" --password "$LS_AGENT_BASIC_PASSWORD" \
        --report /tmp/frontend-journeys.md
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
PARENT = HERE.parent
for path in (str(HERE), str(PARENT)):
    if path not in sys.path:
        sys.path.insert(0, path)

import report as backend_report  # noqa: E402
from diff import summarise  # noqa: E402
from capture import compare_steps  # noqa: E402

ROLE_ENV = {
    "staff": ("LS_AGENT_STAFF_USER", "LS_AGENT_STAFF_PASSWORD"),
    "team_manager": (
        "LS_AGENT_TEAM_MANAGER_USER",
        "LS_AGENT_TEAM_MANAGER_PASSWORD",
    ),
    "official": ("LS_AGENT_OFFICIAL_USER", "LS_AGENT_OFFICIAL_PASSWORD"),
}


def selected_journeys(requested, available):
    """Resolve ``--journeys``; an empty selection means all, unknown names fail."""
    if not requested:
        return list(available)
    unknown = [name for name in requested if name not in available]
    if unknown:
        raise ValueError(f"unknown journey(s): {', '.join(sorted(unknown))}")
    return list(requested)


def role_credentials(env):
    """Harness role credentials present in ``env``; absent ones are not faked."""
    return {
        role: (env.get(user_var, ""), env.get(pass_var, ""))
        for role, (user_var, pass_var) in ROLE_ENV.items()
    }


def render_report(
    *,
    run_id,
    ref_sha,
    cand_sha,
    journey_count,
    diffs,
    skipped,
    errors,
    intended,
    step_counts=None,
    min_steps=2,
    insufficient=(),
):
    """Render the redacted frontend report (journey/step paths and counts only)."""
    declared, unexplained = backend_report.split_intended(diffs, intended)
    counts = summarise([item for found in unexplained.values() for item in found])
    lines = [
        "## Phase 3 — frontend journey equivalence report",
        "",
        f"Run id: `{run_id}`",
        "",
        "| side | baked commit |",
        "|---|---|",
        f"| ref | `{ref_sha or 'unknown'}` |",
        f"| cand | `{cand_sha or 'unknown'}` |",
        "",
        f"Journeys compared: **{journey_count}** · "
        f"diffs: **{len(unexplained)}** · errors: **{len(errors)}**",
        f"Minimum captured steps per journey: **{min_steps}** "
        f"(ref/cand: {step_counts or {}})",
        "",
    ]
    if insufficient:
        lines += [
            "### Journeys with too few captured steps",
            "",
            "A skipped or empty journey cannot witness behaviour:",
            "",
        ]
        lines += [f"- `{item}`" for item in sorted(insufficient)]
        lines.append("")
    if errors:
        lines += ["### Harness errors", ""]
        lines += [f"- {error}" for error in errors]
        lines.append("")
    lines += ["### Unexplained diffs", ""]
    if unexplained:
        for name in sorted(unexplained):
            rendered = ", ".join(item.render() for item in unexplained[name])
            lines.append(f"- `{name}`: {rendered}")
    else:
        lines.append("None.")
    lines.append("")
    if declared:
        lines += ["### Intended diffs (declared by this phase)", ""]
        for name in sorted(declared):
            rendered = ", ".join(item.render() for item in declared[name])
            lines.append(f"- `{name}`: {rendered}")
        lines.append("")
    lines += ["### Skipped steps (role login/target unavailable)", ""]
    if skipped:
        for name in sorted(skipped):
            lines.append(f"- `{name}`: {', '.join(skipped[name])}")
    else:
        lines.append("None.")
    lines += [
        "",
        "### Summary",
        "",
        f"- Diffs by kind: {counts or '{}'}",
        f"- {backend_report.REDACTION_NOTE}",
        "",
    ]
    return "\n".join(lines)


def _load_intended(path):
    if not path:
        return {}
    import json

    return json.loads(Path(path).read_text(encoding="utf-8"))


def run(args, deps):
    """Execute the selected journeys on both sides and render their diff."""
    errors = []
    run_id = args.run_id or deps["now"]()
    selected = selected_journeys(args.journeys, deps["journeys"])
    credentials = role_credentials(deps["env"])
    contexts = {
        side: deps["context"](
            url, args.username, args.password, credentials, errors, deps["browser"]
        )
        for side, url in (("ref", args.ref), ("cand", args.cand))
    }
    shas = {
        side: deps["sha"](url, args.username, args.password)
        for side, url in (("ref", args.ref), ("cand", args.cand))
    }
    diffs = {}
    skipped = {}
    step_counts = {}
    insufficient = []
    min_steps = getattr(args, "min_steps", 2)
    for name in selected:
        journey = deps["journeys"][name]
        left_steps, left_skipped = journey(
            contexts["ref"], f"{run_id}-ref", credentials
        )
        right_steps, right_skipped = journey(
            contexts["cand"], f"{run_id}-cand", credentials
        )
        found = compare_steps(left_steps, right_steps, name)
        if found:
            diffs.update(found)
        combined = sorted(set(left_skipped) | set(right_skipped))
        if combined:
            skipped[f"{name}:steps"] = combined
        counts = (len(left_steps), len(right_steps))
        step_counts[name] = counts
        if min(counts) < min_steps:
            insufficient.append(f"{name}: {counts[0]}/{counts[1]}")
    # Each side's contexts (and their pages) are closed after the journeys so
    # no SSE/fetch connection is left pinning a side's worker.
    deps["close_contexts"](contexts)

    intended = _load_intended(args.intended)
    text = render_report(
        run_id=run_id,
        ref_sha=shas["ref"],
        cand_sha=shas["cand"],
        journey_count=len(selected),
        diffs=diffs,
        skipped=skipped,
        errors=errors,
        intended=intended,
        step_counts=step_counts,
        min_steps=min_steps,
        insufficient=insufficient,
    )
    if args.report:
        Path(args.report).write_text(text, encoding="utf-8")
    print(text)
    for pr in args.comment_pr or []:
        deps["comment"](pr, text)
    _, unexplained = backend_report.split_intended(diffs, intended)
    # A green report must witness the moved code: an unexplained diff, a
    # skipped step, a harness error or a too-short journey all fail the run.
    return 1 if (unexplained or skipped or errors or insufficient) else 0


def main(argv=None, deps=None):
    if deps is None:
        from browser import real_deps

        deps = real_deps()
    parser = argparse.ArgumentParser(description="Phase 3 frontend journey runner")
    parser.add_argument("--ref", required=True, help="reference deployment base URL")
    parser.add_argument("--cand", required=True, help="candidate deployment base URL")
    parser.add_argument("--username", default="", help="basic-auth user")
    parser.add_argument("--password", default="", help="basic-auth password")
    parser.add_argument("--report", default=None, help="write the markdown report here")
    parser.add_argument("--run-id", default=None, help="run id used in entity tags")
    parser.add_argument(
        "--comment-pr", nargs="*", type=int, default=[], help="PRs to comment on"
    )
    parser.add_argument(
        "--journeys", nargs="*", default=[], help="journey names (default: all)"
    )
    parser.add_argument(
        "--intended", default=None, help="JSON file declaring intended step diffs"
    )
    parser.add_argument(
        "--min-steps",
        type=int,
        default=2,
        help="minimum captured steps per journey (default: 2)",
    )
    args = parser.parse_args(argv)
    try:
        return run(args, deps)
    finally:
        deps["close_browser"](deps["browser"])


if __name__ == "__main__":  # pragma: no cover -- CLI entrypoint, exercised via main()
    sys.exit(main())
