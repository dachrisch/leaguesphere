"""Tests for the equivalence diff + report redaction (Phase 0c, issue #2536).

Reports are posted to public PRs, so a diff must expose paths and kinds but
never values.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diff import (  # noqa: E402
    EXTRA,
    LENGTH,
    MISSING,
    TYPE,
    VALUE,
    Diff,
    diff_json,
    diff_text,
)


def test_identical_json_has_no_diffs():
    payload = {"a": [1, 2], "b": {"c": "x"}}

    assert diff_json(payload, payload) == []


def test_value_diff_reports_the_path_only():
    diffs = diff_json({"score": 3}, {"score": 4})

    assert diffs == [Diff("$.score", VALUE)]
    assert "3" not in diffs[0].render()
    assert "4" not in diffs[0].render()


def test_missing_extra_and_type_diffs():
    left = {"kept": 1, "gone": 2, "typed": "1"}
    right = {"kept": 1, "added": 3, "typed": 1}

    diffs = {item.path: item.kind for item in diff_json(left, right)}

    assert diffs["$.gone"] == MISSING
    assert diffs["$.added"] == EXTRA
    assert diffs["$.typed"] == TYPE


def test_array_length_diff():
    diffs = diff_json({"games": [1, 2]}, {"games": [1]})

    assert Diff("$.games[]", LENGTH) in diffs


def test_text_diff_reports_line_numbers_not_content():
    diffs = diff_text("alpha\nsecret-one\ngamma", "alpha\nsecret-two\ngamma")

    assert diffs == [Diff("line 2", "line")]
    assert "secret" not in diffs[0].render()
