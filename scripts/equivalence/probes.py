"""Probe selection and execution for the equivalence harness.

The manifest describes a *coverage-based* sample: one gameday per schedule
type (with and without a designer canvas), finished and upcoming, and league
tables for those leagues/seasons. Gameday ids depend on the restored stage
database, so the sample is resolved at run time from the gameday list API -
the manifest stores selection rules, never ids.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path

import normalise
from diff import Diff, TYPE, VALUE, diff_json, diff_text

PLACEHOLDERS = {
    "gameday_id": "id",
    "season_id": "season",
    "league_id": "league",
    "game_id": "game_id",
}


@dataclass(frozen=True)
class Probe:
    name: str
    path: str
    kind: str
    role: str
    headers: dict = field(default_factory=dict)


@dataclass
class ProbeResult:
    name: str
    status: int
    kind: str
    body: object
    role: str = "anonymous"
    etag: str = ""


def _header(headers, name):
    """Case-insensitive response-header lookup."""
    return next(
        (value for key, value in headers.items() if key.lower() == name.lower()), ""
    )


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


def discover_games(session, manifest, gamedays):
    """Add one sampled game id to each gameday for the feed probes.

    Reuses the games endpoint already probed by the harness; one extra read
    per sampled gameday, no new endpoint. A gameday without games keeps
    ``game_id`` unset, so the placeholder stays literal and never points at a
    made-up game.
    """
    template = manifest.get("game_discovery", {}).get(
        "path", "/api/gamedays/{gameday_id}/games/"
    )
    enriched = []
    for gameday in gamedays:
        item = dict(gameday)
        response = session.request(_fill(template, gameday))
        if response.status == 200:
            try:
                games = response.json()
            except ValueError:
                games = []
            if games and isinstance(games[0], dict) and games[0].get("id") is not None:
                item["game_id"] = games[0]["id"]
        enriched.append(item)
    return enriched


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


def _validator_source(probe_name):
    """Name of the probe whose ETag a revalidation probe must reuse.

    ``feed-etag-revalidation#completed:13`` revalidates
    ``game-feed#completed:13``; the ``#category:id`` sample suffix must be
    preserved so two samples never share a validator.
    """

    base, separator, sample = probe_name.partition("#")
    source_bases = {
        "feed-etag-revalidation": "game-feed",
        "liveticker-etag-revalidation": "liveticker-api",
        "snapshot-etag-revalidation": "snapshot-api",
    }
    if base in source_bases:
        base = source_bases[base]
    elif base.endswith("-etag-revalidation"):
        base = base[: -len("-etag-revalidation")]
    return base + separator + sample


def _headers(definition, probe_name, source_name=None):
    """Resolve a header's ``{source}`` placeholder to the sampled source probe.

    ``source_name`` is the probe that already fetched the same target, when
    the expansion knows it; otherwise the name is derived from ``probe_name``.
    """

    source_name = source_name or _validator_source(probe_name)
    return {
        key: value.replace("{source}", source_name)
        for key, value in definition.get("headers", {}).items()
    }


def expand_probes(manifest, gamedays):
    """Turn manifest entries into concrete probes for this sample."""
    sample = select_sample(manifest, gamedays)
    probes = []
    seen = set()
    # Plain probe kept per target, so a conditional probe on the same target
    # revalidates the ETag of the response that was actually fetched.
    fetched_by = {}

    for definition in manifest.get("probes", []):
        categories = definition.get("categories")
        if not categories:
            probes.append(
                Probe(
                    name=definition["name"],
                    path=definition["path"],
                    kind=definition["kind"],
                    role=definition["role"],
                    headers=_headers(definition, definition["name"]),
                )
            )
            continue
        for category in categories:
            for gameday in sample.get(category, []):
                path = _fill(definition["path"], gameday)
                # A gameday with no games leaves {game_id} literal; a probe
                # against it is a 404 on both sides, not a comparison.
                if any("{" + name + "}" in path for name in PLACEHOLDERS):
                    continue
                target = (path, definition["role"], definition["kind"])
                # Headers are part of the identity: a revalidation probe shares
                # its target with the plain probe it revalidates and must not
                # be deduped away. Only the same definition seen through a
                # second category (same gameday) is a duplicate.
                headers = tuple(sorted(definition.get("headers", {}).items()))
                key = target + (headers,)
                if key in seen:
                    continue
                seen.add(key)
                name = f"{definition['name']}#{category}:{gameday.get('id')}"
                if not headers:
                    fetched_by.setdefault(target, name)
                probes.append(
                    Probe(
                        name=name,
                        path=path,
                        kind=definition["kind"],
                        role=definition["role"],
                        headers=_headers(definition, name, fetched_by.get(target)),
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
        headers = {}
        for key, value in probe.headers.items():
            if value.startswith("@etag:"):
                source_name = value[len("@etag:") :]
                source = results.get(source_name)
                if source is None:
                    # Older manifests reference a bare base name; resolve it
                    # to the first category-expanded sample for compatibility.
                    # New manifests pass the exact ``base#category:id`` name
                    # from ``{source}`` so the validator is sample-specific.
                    source = next(
                        (
                            result
                            for name, result in results.items()
                            if name.startswith(source_name + "#")
                        ),
                        None,
                    )
                value = source.etag if source else ""
            headers[key] = value
        response = session.request(probe.path, headers=headers)
        results[probe.name] = ProbeResult(
            name=probe.name,
            status=response.status,
            kind=probe.kind,
            body=normalise.normalise_body(probe.kind, response.body),
            role=probe.role,
            etag=_header(response.headers, "ETag"),
        )
    return results, skipped


def revalidation_misses(results, probes):
    """Revalidation probes whose own sample never answered 304.

    A 200 on a conditional request means the validator was wrong or missing,
    so the 200↔304 contract was not demonstrated for that probe. A conditional
    probe with no result at all (never run) is a miss too: a revalidation that
    silently did not happen must not read as a pass.
    """

    conditional = {
        probe.name
        for probe in probes
        if any(value.startswith("@etag:") for value in probe.headers.values())
    }
    return sorted(
        name
        for name in conditional
        if name not in results or results[name].status != 304
    )


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
    "revalidation_misses",
    "run_probes",
    "select_sample",
]
