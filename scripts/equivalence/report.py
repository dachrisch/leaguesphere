"""Redacted markdown report for the equivalence harness.

The report is posted to public pull requests, so it contains **no payload
values**: only probe names, field paths, diff kinds and counts. Tunnel URLs
and credentials never appear either.
"""

from __future__ import annotations

from diff import summarise

REDACTION_NOTE = (
    "Redacted by design: paths, field names and counts only — "
    "no values, emails, names or credentials."
)


def _format_sha(sha):
    return f"`{sha or 'unknown'}`"


def _format_diffs(diffs):
    lines = []
    for name in sorted(diffs):
        rendered = ", ".join(item.render() for item in diffs[name])
        lines.append(f"- `{name}`: {rendered}")
    return lines


def split_intended(diffs, intended):
    """Split diffs into ``(intended, unexplained)``.

    ``intended`` maps probe name to a list of ``path`` values that this
    phase deliberately changes. A diff is intended only when both the probe
    and its path are declared.
    """
    intended_diffs = {}
    unexplained = {}
    for name, found in diffs.items():
        allowed = set(intended.get(name, []))
        keep = [item for item in found if item.path in allowed]
        rest = [item for item in found if item.path not in allowed]
        if keep:
            intended_diffs[name] = keep
        if rest:
            unexplained[name] = rest
    return intended_diffs, unexplained


def render_report(
    *,
    run_id,
    ref_sha,
    cand_sha,
    probe_count,
    skipped_probes,
    intended,
    diffs,
    scenario_runs,
    scenario_diffs,
    errors,
    verified_contracts=(),
    etag_revalidation_misses=(),
):
    intended_diffs, unexplained = split_intended(diffs, intended)
    # Phase 2: scenario diffs are keyed ``<scenario>:<step>`` and may be
    # declared intended exactly like probe diffs. Unexplained ones fail the run.
    intended_scenarios, unexplained_scenarios = split_intended(scenario_diffs, intended)
    all_diffs = {**unexplained, **unexplained_scenarios}
    counts = summarise([item for found in all_diffs.values() for item in found])

    lines = [
        "## Phase 0c — equivalence report",
        "",
        f"Run id: `{run_id}`",
        "",
        "| side | baked commit |",
        "|---|---|",
        f"| ref | {_format_sha(ref_sha)} |",
        f"| cand | {_format_sha(cand_sha)} |",
        "",
        f"Probes compared: **{probe_count}** · "
        f"diffs: **{len(all_diffs)}** · "
        f"skipped: **{len(skipped_probes)}**",
        "",
    ]

    if errors:
        lines += ["### Harness errors", ""]
        lines += [f"- {error}" for error in errors]
        lines.append("")

    lines += ["### Unexplained diffs", ""]
    if all_diffs:
        lines += _format_diffs(all_diffs)
    else:
        lines.append("None.")
    lines.append("")

    if intended_diffs or intended_scenarios:
        lines += ["### Intended diffs (declared by this phase)", ""]
        lines += _format_diffs({**intended_diffs, **intended_scenarios})
        lines.append("")

    lines += ["### Write scenarios", ""]
    if scenario_runs:
        for run in scenario_runs:
            # Scenario diffs are keyed ``<scenario>:<step>`` since Layer 3.
            status = (
                "diff"
                if any(key.startswith(run + ":") for key in scenario_diffs)
                else "clean"
            )
            lines.append(
                f"- `{run}`: {status}"
                + (
                    f" — skipped steps: {', '.join(sorted(scenario_runs[run]))}"
                    if scenario_runs[run]
                    else ""
                )
            )
    else:
        lines.append("No scenario was run.")
    lines.append("")

    if scenario_diffs:
        lines += ["### Scenario diffs", ""]
        lines += _format_diffs(scenario_diffs)
        lines.append("")

    if verified_contracts:
        lines += ["### Verified per-side contracts", ""]
        lines += [
            f"- `{name}`: needs_reconciliation on both sides"
            for name in verified_contracts
        ]
        lines.append("")

    if etag_revalidation_misses:
        lines += ["### ETag revalidation without a 304", ""]
        lines += [f"- `{name}`" for name in etag_revalidation_misses]
        lines.append("")

    if skipped_probes:
        lines += ["### Skipped probes (role credentials not supplied)", ""]
        lines += [f"- `{name}`" for name in sorted(skipped_probes)]
        lines.append("")

    lines += [
        "### Summary",
        "",
        f"- Diffs by kind: {counts or '{}'}",
        f"- {REDACTION_NOTE}",
        "",
    ]
    return "\n".join(lines)
