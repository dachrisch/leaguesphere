"""Tests for probe selection, execution and ref-vs-ref comparison."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import probes  # noqa: E402
from diff import Diff, VALUE  # noqa: E402
from transport import RecordedSession  # noqa: E402

GAMEDAYS = [
    {
        "id": 11,
        "season": 3,
        "league": 7,
        "status": "PUBLISHED",
        "has_designer_state": True,
    },
    {
        "id": 12,
        "season": 3,
        "league": 7,
        "status": "PUBLISHED",
        "has_designer_state": False,
    },
    {
        "id": 13,
        "season": 3,
        "league": 7,
        "status": "COMPLETED",
        "has_designer_state": False,
    },
    {
        "id": 14,
        "season": 3,
        "league": 7,
        "status": "PUBLISHED",
        "has_designer_state": True,
    },
]

MANIFEST = {
    "roles": {"anonymous": {}},
    "discovery": {"path": "/api/gamedays/", "results_key": "results"},
    "categories": [
        {"name": "designer-template", "where": {"has_designer_state": True}},
        {
            "name": "canvas-published",
            "where": {"status": "PUBLISHED", "has_designer_state": False},
        },
    ],
    "sample_per_category": 1,
    "probes": [
        {"name": "root", "path": "/", "kind": "html", "role": "anonymous"},
        {
            "name": "gameday-page",
            "path": "/gamedays/gameday/{gameday_id}/",
            "kind": "html",
            "role": "anonymous",
            "categories": ["designer-template", "canvas-published"],
        },
        {
            "name": "gameday-api",
            "path": "/api/gameday/{gameday_id}/",
            "kind": "json",
            "role": "anonymous",
            "categories": ["designer-template"],
        },
        {"name": "staff-page", "path": "/staff/", "kind": "html", "role": "staff"},
    ],
}


def discovery_session(body=None):
    return RecordedSession(
        {
            ("GET", "/api/gamedays/"): (200, body or {"results": GAMEDAYS}),
            ("GET", "/"): (200, "<html>home</html>"),
            ("GET", "/gamedays/gameday/11/"): (200, "<html>designer</html>"),
            ("GET", "/gamedays/gameday/12/"): (200, "<html>legacy</html>"),
            ("GET", "/api/gameday/11/"): (200, {"id": 11, "name": "Cup"}),
        }
    )


def test_select_sample_respects_category_and_limit():
    sample = probes.select_sample(MANIFEST, GAMEDAYS)

    assert sample["designer-template"] == [GAMEDAYS[0]]
    assert sample["canvas-published"] == [GAMEDAYS[1]]


def test_expand_probes_resolves_placeholders_and_dedupes():
    expanded = probes.expand_probes(MANIFEST, GAMEDAYS)

    paths = [probe.path for probe in expanded]
    assert "/gamedays/gameday/11/" in paths
    assert "/gamedays/gameday/12/" in paths
    assert "/api/gameday/11/" in paths
    # The staff probe has no categories and is kept once.
    assert paths.count("/staff/") == 1


def test_run_probes_skips_roles_without_credentials():
    session = discovery_session()
    expanded = probes.expand_probes(MANIFEST, GAMEDAYS)

    results, skipped = probes.run_probes({"anonymous": session}, MANIFEST, expanded)

    assert skipped == ["staff-page"]
    assert "gameday-page#designer-template:11" in results


def test_ref_vs_ref_is_zero_diffs():
    manifest = MANIFEST
    first, _ = probes.run_probes(
        {"anonymous": discovery_session()},
        manifest,
        probes.expand_probes(manifest, GAMEDAYS),
    )
    second, _ = probes.run_probes(
        {"anonymous": discovery_session()},
        manifest,
        probes.expand_probes(manifest, GAMEDAYS),
    )

    assert probes.compare_probe_results(first, second) == {}


def test_planted_noise_is_normalised_away():
    manifest = MANIFEST
    quiet = discovery_session()
    quiet.responses[("GET", "/api/gameday/11/")] = (
        200,
        {"id": 11, "name": "Cup", "updated_at": "2026-11-25T11:00:00Z"},
    )
    first, _ = probes.run_probes(
        {"anonymous": quiet}, manifest, probes.expand_probes(manifest, GAMEDAYS)
    )
    noisy = discovery_session({"results": GAMEDAYS})
    noisy.responses[("GET", "/api/gameday/11/")] = (
        200,
        {"id": 11, "name": "Cup", "updated_at": "2026-11-25T12:00:00Z"},
    )
    second, _ = probes.run_probes(
        {"anonymous": noisy}, manifest, probes.expand_probes(manifest, GAMEDAYS)
    )

    assert probes.compare_probe_results(first, second) == {}


def test_real_difference_is_reported():
    manifest = MANIFEST
    first, _ = probes.run_probes(
        {"anonymous": discovery_session()},
        manifest,
        probes.expand_probes(manifest, GAMEDAYS),
    )
    changed = discovery_session()
    changed.responses[("GET", "/api/gameday/11/")] = (200, {"id": 11, "name": "Cup 2"})
    second, _ = probes.run_probes(
        {"anonymous": changed}, manifest, probes.expand_probes(manifest, GAMEDAYS)
    )

    diffs = probes.compare_probe_results(first, second)
    assert diffs["gameday-api#designer-template:11"] == [Diff("$.name", VALUE)]
