"""
Tests for SwissRoundResolver (issue #1970 / PR #1971).

JLT Flag 2026 rules (per design doc):
- Teams grouped by points; within a group top half of seeds plays bottom half.
- Odd-sized groups float their lowest seed down to the next-lower points group.
- Bye goes to the lowest-ranked team that hasn't had one yet, worth 2 points.
- Score margins don't affect pairings.
"""

import pytest

from gameday_designer.service.swiss_round_resolver import (
    SwissRoundResolver,
    SwissRoundResult,
)


def test_first_round_pairs_top_half_vs_bottom_half_by_seed():
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3", "T4"],
        points={},
    )
    assert isinstance(result, SwissRoundResult)
    assert result.pairings == [("T1", "T3"), ("T2", "T4")]
    assert result.bye is None
    assert result.floaters == []


def test_groups_by_points():
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3", "T4"],
        points={"T1": 2, "T2": 2, "T3": 0, "T4": 0},
    )
    assert result.pairings == [("T1", "T2"), ("T3", "T4")]
    assert result.bye is None


def test_odd_group_floats_lowest_seed_down():
    # 5 teams -> one bye (lowest-ranked without one: T5), remainder of 4:
    # top group of 3 floats lowest seed down, leaving 2 + 2 (even groups).
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3", "T4", "T5"],
        points={"T1": 2, "T2": 2, "T3": 2, "T4": 0, "T5": 0},
    )
    assert result.floaters == ["T3"]
    assert result.bye == "T5"
    assert result.pairings == [("T1", "T2"), ("T3", "T4")]


def test_bye_goes_to_lowest_ranked_team_without_one():
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3"],
        points={"T1": 4, "T2": 2, "T3": 0},
        teams_with_bye={"T3"},
    )
    # T3 already had a bye, so bye must go to T2 (lowest-ranked without one),
    # T1 plays the floater path remainder... with 3 teams and one bye, 2 pair.
    assert result.bye == "T2"
    assert result.pairings == [("T1", "T3")]


def test_bye_worth_two_points_defaults():
    assert SwissRoundResolver.BYE_POINTS == 2


def test_rematch_avoidance_swaps_adjacent_pairing():
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3", "T4"],
        points={},
        previous_pairings={frozenset({"T1", "T3"})},
    )
    # naive pairing would repeat T1-T3; resolver must avoid it via adjacent swap
    assert ("T1", "T3") not in [tuple(sorted(p)) for p in result.pairings]
    paired = sorted([tuple(sorted(p)) for p in result.pairings])
    assert paired == [("T1", "T4"), ("T2", "T3")]


def test_all_teams_paired_or_bye_exactly_once():
    result = SwissRoundResolver.resolve_round(
        seed_order=["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
        points={"T1": 4, "T2": 4, "T3": 2, "T4": 2, "T5": 2, "T6": 0, "T7": 0},
        teams_with_bye=set(),
    )
    seen = [t for pair in result.pairings for t in pair]
    if result.bye:
        seen.append(result.bye)
    assert sorted(seen) == ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]


def _r4_published_run():
    """Standings into round 4 of the approved 6-team published run-through:
    T1 6pts, T2/T3 4pts, T5/T4 2pts, T6 0pts, with R1-R3 history."""
    seed_order = ["T1", "T2", "T3", "T4", "T5", "T6"]
    points = {"T1": 6, "T2": 4, "T3": 4, "T4": 2, "T5": 2, "T6": 0}
    previous = {
        frozenset({"T1", "T4"}),
        frozenset({"T2", "T5"}),
        frozenset({"T3", "T6"}),
        frozenset({"T1", "T2"}),
        frozenset({"T3", "T5"}),
        frozenset({"T4", "T6"}),
        frozenset({"T1", "T3"}),
        frozenset({"T2", "T4"}),
        frozenset({"T5", "T6"}),
    }
    return seed_order, points, previous


def test_global_repair_removes_rematches_adjacent_pass_cannot_fix():
    seed_order, points, previous = _r4_published_run()
    result = SwissRoundResolver.resolve_round(
        seed_order=seed_order,
        points=points,
        previous_pairings=previous,
    )
    paired = [frozenset(pair) for pair in result.pairings]
    assert not any(pair in previous for pair in paired)
    # every team exactly once, no bye in an even pool
    assert result.bye is None
    assert sorted(t for pair in result.pairings for t in pair) == seed_order


def test_global_repair_is_deterministic():
    seed_order, points, previous = _r4_published_run()
    first = SwissRoundResolver.resolve_round(
        seed_order=seed_order, points=points, previous_pairings=previous
    )
    second = SwissRoundResolver.resolve_round(
        seed_order=seed_order, points=points, previous_pairings=previous
    )
    assert first.pairings == second.pairings


def test_global_repair_prefers_same_group_when_rematch_free():
    seed_order, points, previous = _r4_published_run()
    result = SwissRoundResolver.resolve_round(
        seed_order=seed_order, points=points, previous_pairings=previous
    )
    # T2 and T3 share the 4pt group: they must stay paired when that avoids
    # a rematch (cross-group pairs only break ties).
    assert frozenset({"T2", "T3"}) in [frozenset(p) for p in result.pairings]
