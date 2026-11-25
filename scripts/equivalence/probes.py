"""Probe selection and execution for the equivalence harness.

The manifest describes a *coverage-based* sample: one gameday per schedule
type (with and without a designer canvas), finished and upcoming, and league
tables for those leagues/seasons. Gameday ids depend on the restored stage
database, so the sample is resolved at run time from the gameday list API -
the manifest stores selection rules, never ids.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import normalise
from diff import Diff, TYPE, VALUE, diff_json, diff_text

PLACEHOLDERS = {
    "gameday_id": "id",
    "season_id": "season",
    "league_id": "league",
}


@dataclass(frozen=True)
class Probe:
    name: str
    path: str
    kind: str
    role: str


@dataclass
class ProbeResult:
    name: str
    status: int
    kind: str
    body: object
    role: str = "anonymous"


def load_manifest(path=None):
    path = Path(path or Path(__file__).resolve().parent / "manifest.json")
    return json.loads(path.read_text(encoding="utf-8"))


def discover(session, manifest):
    """Return the gameday list used to resolve the sample."""
    discovery = manifest["discovery"]
    response = session.request(discovery["path"])
    if response.status != 200:
        raise RuntimeError(
            f"discovery failed: GET {discovery['path']} -> {response.status}"
        )
    payload = response.json()
    results = payload.get(discovery.get("results_key", "results"), payload)
    return results if isinstance(results, list) else []


def _matches(gameday, where):
    return all(gameday.get(key) == value for key, value in where.items())


def select_sample(manifest, gamedays):
    """Map category name to the sampled gamedays (at most N per category)."""
    limit = int(manifest.get("sample_per_category", 1))
    selected = {}
    for category in manifest.get("categories", []):
        matches = [
            gameday
            for gameday in gamedays
            if _matches(gameday, category.get("where", {}))
        ]
        selected[category["name"]] = matches[:limit]
    return selected


def _fill(path, gameday):
    filled = path
    for placeholder, key in PLACEHOLDERS.items():
        value = gameday.get(key)
        if value is not None:
            filled = filled.replace("{" + placeholder + "}", str(value))
    return filled


def expand_probes(manifest, gamedays):
    """Turn manifest entries into concrete probes for this sample."""
    sample = select_sample(manifest, gamedays)
    probes = []
    seen = set()

    for definition in manifest.get("probes", []):
        categories = definition.get("categories")
        if not categories:
            probes.append(
                Probe(
                    name=definition["name"],
                    path=definition["path"],
                    kind=definition["kind"],
                    role=definition["role"],
                )
            )
            continue
        for category in categories:
            for gameday in sample.get(category, []):
                path = _fill(definition["path"], gameday)
                key = (path, definition["role"], definition["kind"])
                if key in seen:
                    continue
                seen.add(key)
                probes.append(
                    Probe(
                        name=f"{definition['name']}#{category}:{gameday.get('id')}",
                        path=path,
                        kind=definition["kind"],
                        role=definition["role"],
                    )
                )
    return probes


def run_probes(sessions, manifest, probes=None):
    """Run probes through the role sessions.

    Returns ``(results, skipped)``: ``results`` maps probe name to a
    ``ProbeResult``, ``skipped`` lists probes whose role has no session
    (missing harness credentials) - a skip is not a pass.
    """
    if probes is None:
        probes = expand_probes(manifest, discover(sessions["anonymous"], manifest))

    results = {}
    skipped = []
    for probe in probes:
        session = sessions.get(probe.role)
        if session is None:
            skipped.append(probe.name)
            continue
        response = session.request(probe.path)
        results[probe.name] = ProbeResult(
            name=probe.name,
            status=response.status,
            kind=probe.kind,
            body=normalise.normalise_body(probe.kind, response.body),
            role=probe.role,
        )
    return results, skipped


def compare_probe_results(left, right):
    """Diff two runs of the same probe set (ref vs cand, or ref vs ref)."""
    diffs = {}
    for name in sorted(set(left) & set(right)):
        left_result = left[name]
        right_result = right[name]
        found = []
        if left_result.status != right_result.status:
            found.append(Diff("status", "value"))
        left_body = left_result.body
        right_body = right_result.body
        if isinstance(left_body, (dict, list)) and isinstance(right_body, (dict, list)):
            found.extend(diff_json(left_body, right_body))
        elif isinstance(left_body, str) and isinstance(right_body, str):
            found.extend(diff_text(left_body, right_body))
        elif left_body != right_body:
            found.append(Diff("$", TYPE))
        if found:
            diffs[name] = found
    return diffs


def only_left(left, right):
    return sorted(set(left) - set(right))


def describe_diffs(diffs):
    """Render diffs as ``probe: path (kind), ...`` lines (no values)."""
    lines = []
    for name in sorted(diffs):
        rendered = ", ".join(item.render() for item in diffs[name])
        lines.append(f"- `{name}`: {rendered}")
    return lines


__all__ = [
    "Probe",
    "ProbeResult",
    "VALUE",
    "compare_probe_results",
    "describe_diffs",
    "discover",
    "expand_probes",
    "load_manifest",
    "only_left",
    "run_probes",
    "select_sample",
]
