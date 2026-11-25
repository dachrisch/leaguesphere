"""Tests for the redacted equivalence report (Phase 0c, issue #2536)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diff import VALUE, Diff  # noqa: E402
import report  # noqa: E402


def test_report_never_contains_values():
    diffs = {
        "gameday-api": [Diff("$.name", VALUE), Diff("$.games[0].home", VALUE)],
    }
    text = report.render_report(
        run_id="eq-test",
        ref_sha="refsha",
        cand_sha="candsha",
        probe_count=2,
        skipped_probes=["teammanager-page"],
        intended={},
        diffs=diffs,
        scenario_runs={},
        scenario_diffs={},
        errors=[],
    )

    assert "$.name" in text
    assert "eq-test" in text
    assert "teammanager-page" in text
    assert report.REDACTION_NOTE in text


def test_split_intended_separates_declared_paths():
    diffs = {"probe": [Diff("$.a", VALUE), Diff("$.b", VALUE)]}

    intended, unexplained = report.split_intended(diffs, {"probe": ["$.a"]})

    assert intended == {"probe": [Diff("$.a", VALUE)]}
    assert unexplained == {"probe": [Diff("$.b", VALUE)]}
