#!/usr/bin/env python3
"""Equivalence runner (Phase 0c, dachrisch/leaguesphere#2536).

Compares two deployments that share one database:

- ``ref`` — the master image the phase started from,
- ``cand`` — the stack head / agent candidate.

Read probes run against both and are diffed structurally (JSON) or as
normalised text (HTML). Write scenarios create run-id-tagged entities on
each side and are diffed with their ids normalised. The resulting markdown
report is redacted and can be posted to the stack PRs with ``gh pr comment``.

Usage::

    python3 scripts/equivalence/runner.py \
        --ref https://ref.example --cand https://cand.example \
        --username "$LS_AGENT_BASIC_USER" --password "$LS_AGENT_BASIC_PASSWORD" \
        --report /tmp/equivalence.md --comment-pr 2600 2601

Role probes are skipped (and reported as skipped) when the harness role
credentials are not present in the environment; they are never faked.
"""

from __future__ import annotations

import argparse
import datetime
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import probes as probe_mod  # noqa: E402
import report as report_mod  # noqa: E402
import scenarios as scenario_mod  # noqa: E402
from diff import TYPE, VALUE, Diff, diff_json, diff_text  # noqa: E402
from transport import build_sessions  # noqa: E402


def scenario_context(gamedays):
    for gameday in gamedays:
        if gameday.get("season") and gameday.get("league"):
            return {
                "season_id": gameday["season"],
                "league_id": gameday["league"],
            }
    return {}


def compare_scenario_runs(left, right):
    diffs = {}
    left_results = left.as_results()
    right_results = right.as_results()
    for name in sorted(set(left_results) & set(right_results)):
        left_step = left_results[name]
        right_step = right_results[name]
        found = []
        if left_step.status != right_step.status:
            found.append(Diff("status", VALUE))
        left_body = left_step.body
        right_body = right_step.body
        if isinstance(left_body, (dict, list)) and isinstance(right_body, (dict, list)):
            found.extend(diff_json(left_body, right_body))
        elif isinstance(left_body, str) and isinstance(right_body, str):
            found.extend(diff_text(left_body, right_body))
        elif left_body != right_body:
            found.append(Diff("$", TYPE))
        if found:
            diffs[name] = found
    return diffs


def baked_sha(session):
    response = session.request("/health/version/")
    if response.status != 200:
        return "unknown"
    try:
        return response.json().get("sha", "unknown")
    except ValueError:
        return "unknown"


def run(args):
    manifest = probe_mod.load_manifest(args.manifest)
    errors = []
    run_id = args.run_id or datetime.datetime.now().strftime("eq-%Y%m%d-%H%M%S")

    ref_sessions = build_sessions(
        args.ref, args.username, args.password, manifest, errors
    )
    cand_sessions = build_sessions(
        args.cand, args.username, args.password, manifest, errors
    )

    ref_sha = baked_sha(ref_sessions["anonymous"])
    cand_sha = baked_sha(cand_sessions["anonymous"])

    gamedays = probe_mod.discover(ref_sessions["anonymous"], manifest)
    probes = probe_mod.expand_probes(manifest, gamedays)
    ref_results, ref_skipped = probe_mod.run_probes(ref_sessions, manifest, probes)
    cand_results, cand_skipped = probe_mod.run_probes(cand_sessions, manifest, probes)
    skipped = sorted(set(ref_skipped) | set(cand_skipped))
    diffs = probe_mod.compare_probe_results(ref_results, cand_results)
    for name in probe_mod.only_left(ref_results, cand_results):
        diffs.setdefault(name, []).append(Diff("$", "missing"))

    scenario_runs = {}
    scenario_diffs = {}
    context = scenario_context(gamedays)
    if not args.skip_scenarios and context:
        # Same stage database on both sides: discovering the template once is
        # deterministic and adds no probe noise. Unavailable data stays
        # unresolved and is reported as a harness error, never fabricated.
        context.update(scenario_mod.discover_template_context(ref_sessions))
        for name in scenario_mod.SCENARIOS:
            if args.scenarios and name not in args.scenarios:
                continue
            try:
                ref_run = scenario_mod.run_scenario(
                    name, ref_sessions, context, f"{run_id}-ref"
                )
                cand_run = scenario_mod.run_scenario(
                    name, cand_sessions, context, f"{run_id}-cand"
                )
            except RuntimeError as error:
                errors.append(str(error).replace("\n", " "))
                continue
            scenario_runs[name] = sorted(set(ref_run.skipped) | set(cand_run.skipped))
            found = compare_scenario_runs(ref_run, cand_run)
            if found:
                scenario_diffs[name] = [
                    item for step_diffs in found.values() for item in step_diffs
                ]

    text = report_mod.render_report(
        run_id=run_id,
        ref_sha=ref_sha,
        cand_sha=cand_sha,
        probe_count=len(ref_results),
        skipped_probes=skipped,
        intended=_load_intended(args.intended),
        diffs=diffs,
        scenario_runs=scenario_runs,
        scenario_diffs=scenario_diffs,
        errors=errors,
    )

    if args.report:
        Path(args.report).write_text(text, encoding="utf-8")
    print(text)

    for pr in args.comment_pr or []:
        subprocess.run(
            ["gh", "pr", "comment", str(pr), "--body", text],
            check=False,
        )

    return 1 if scenario_diffs or _has_unexplained(diffs, args.intended) else 0


def _load_intended(path):
    if not path:
        return {}
    import json

    return json.loads(Path(path).read_text(encoding="utf-8"))


def _has_unexplained(diffs, intended_path):
    intended = _load_intended(intended_path)
    _, unexplained = report_mod.split_intended(diffs, intended)
    return bool(unexplained)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Phase 0c equivalence runner")
    parser.add_argument("--ref", required=True, help="reference deployment base URL")
    parser.add_argument("--cand", required=True, help="candidate deployment base URL")
    parser.add_argument("--username", default="", help="basic-auth user for the proxy")
    parser.add_argument("--password", default="", help="basic-auth password")
    parser.add_argument("--manifest", default=None, help="probe manifest (JSON)")
    parser.add_argument("--report", default=None, help="write the markdown report here")
    parser.add_argument("--run-id", default=None, help="run id used in scenario tags")
    parser.add_argument(
        "--comment-pr",
        nargs="*",
        type=int,
        default=[],
        help="PR numbers to post the report to with `gh pr comment`",
    )
    parser.add_argument(
        "--scenarios",
        nargs="*",
        default=[],
        help="scenario names to run (default: all)",
    )
    parser.add_argument(
        "--skip-scenarios",
        action="store_true",
        help="probes only (the 0b noise-floor / zero-diff check)",
    )
    parser.add_argument(
        "--intended",
        default=None,
        help="JSON file declaring intended diffs: {probe: [path, ...]}",
    )
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
