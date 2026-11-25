"""Structural diffs for the Phase 0c equivalence harness (dachrisch/leaguesphere#2536).

The report is posted to public pull requests, so a diff must never carry the
compared *values*: only paths, field names and counts. These functions
therefore return ``Diff`` records with a location and a kind, never the
payload that differed.
"""

from __future__ import annotations

from dataclasses import dataclass
import difflib

VALUE = "value"
TYPE = "type"
MISSING = "missing"
EXTRA = "extra"
LENGTH = "length"
LINE = "line"


@dataclass(frozen=True)
class Diff:
    path: str
    kind: str

    def render(self):
        return f"{self.path} ({self.kind})"


def _type_name(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def diff_json(left, right, path="$"):
    """Compare two normalised JSON values; return paths that differ."""
    diffs = []
    if type(left) is not type(right):
        return [Diff(path, TYPE)]
    if isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            child = f"{path}.{key}"
            if key not in left:
                diffs.append(Diff(child, EXTRA))
            elif key not in right:
                diffs.append(Diff(child, MISSING))
            else:
                diffs.extend(diff_json(left[key], right[key], child))
    elif isinstance(left, list):
        if len(left) != len(right):
            diffs.append(Diff(f"{path}[]", LENGTH))
        for index, (left_item, right_item) in enumerate(zip(left, right)):
            diffs.extend(diff_json(left_item, right_item, f"{path}[{index}]"))
    elif left != right:
        diffs.append(Diff(path, VALUE))
    return diffs


def diff_text(left, right):
    """Compare two normalised documents line by line.

    Returns one ``Diff`` per changed line group, carrying the line numbers
    only (never the content). Line numbers are 1-based on the ``left``
    side; replaced/inserted groups use the left insertion point.
    """
    left_lines = left.splitlines()
    right_lines = right.splitlines()
    diffs = []
    matcher = difflib.SequenceMatcher(a=left_lines, b=right_lines, autojunk=False)
    for tag, left_start, left_end, right_start, right_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        kind = LINE if tag == "replace" else tag
        diffs.append(Diff(f"line {left_start + 1}", kind))
    return diffs


def summarise(diffs):
    """Count diffs by kind, e.g. ``{"value": 3, "missing": 1}``."""
    counts = {}
    for diff in diffs:
        counts[diff.kind] = counts.get(diff.kind, 0) + 1
    return counts
