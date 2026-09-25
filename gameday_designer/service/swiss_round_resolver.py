"""
Swiss-system round resolver (issue #1970).

Implements the JLT Flag 2026 pairing rules scoped in
``docs/plans/2026-09-20-swiss-system-1970-design.md``:

- Teams are grouped by current points (descending).
- Within each group, teams are ordered by the pre-tournament seed list and
  the top half plays the bottom half (``top[i] vs bottom[i]``).
- Odd-sized groups float their lowest seed down into the next-lower points
  group.
- Exactly one bye per round when the active-team count is odd, assigned
  upfront to the lowest-ranked team (points, then seed) that has not had one
  yet, worth ``BYE_POINTS`` (2) points. This keeps every group's pool even
  through the floater cascade — see the invariant check in ``resolve_round``.
- Score margins don't affect pairings; only points + seed order matter.
- Rematch avoidance is two-stage, deterministic, no randomness: first an
  adjacent swap (a repeated pairing swaps away teams with a neighbour when
  that resolves both without creating a new rematch), then — only if
  rematches remain — a bounded backtracking search over the round pool for
  the pairing with the fewest rematches (cross-group pairs only break ties,
  so the same-group structure wins whenever it is rematch-free).

Open-question rulings for v1 (see design doc):
- Bye is a standings-only adjustment returned separately (``bye``); no
  synthetic ``Gameinfo`` row is created.
- Final-ranking tie-breaks are out of scope: ordering is points then seed.
"""

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Sequence, Set


@dataclass(frozen=True)
class SwissRoundResult:
    """Pairings for one Swiss round."""

    pairings: List[tuple] = field(default_factory=list)
    bye: Optional[str] = None
    floaters: List[str] = field(default_factory=list)


class SwissRoundResolver:
    """Generates Swiss-system pairings for a single round."""

    BYE_POINTS = 2

    # A rematch outweighs any number of cross-group pairs: the global repair
    # below always prefers a rematch-free round over a same-group round with
    # repeats. Cross-group count only breaks ties between equally
    # rematch-free (or equally rematch-burdened) candidates.
    _REMATCH_COST = 1000

    # Cap on explored partial matchings in _repair_rematches_global. Pools
    # are at most 16 teams (template max) and the search prunes on the
    # adjacent-pass result, so ordinary rounds finish far below this; the cap
    # only guards pathological late-tournament states. Falls back to the
    # best pairing found so far (never worse than the adjacent pass).
    _REPAIR_SEARCH_BUDGET = 20000

    @staticmethod
    def resolve_round(
        seed_order: Sequence[str],
        points: Optional[Dict[str, float]] = None,
        teams_with_bye: Optional[Set[str]] = None,
        previous_pairings: Optional[Set[FrozenSet[str]]] = None,
    ) -> SwissRoundResult:
        # Bye point value (BYE_POINTS) is applied by the standings query, not
        # by pairing itself — resolve_round only decides *who* gets the bye.
        points = dict(points or {})
        teams_with_bye = set(teams_with_bye or set())
        previous_pairings = set(previous_pairings or set())

        seed_index = {team: i for i, team in enumerate(seed_order)}

        def rank_key(team: str):
            return (-points.get(team, 0), seed_index.get(team, len(seed_order)))

        # Odd active-team count => exactly one bye: assign it first, globally,
        # to the lowest-ranked team without one. The remainder is even and is
        # then paired via the floater cascade below.
        bye: Optional[str] = None
        active = list(seed_order)
        if len(active) % 2 == 1:
            bye = SwissRoundResolver._pick_bye(active, rank_key, teams_with_bye)
            active = [t for t in active if t != bye]

        # Group by points, descending; members ordered by seed.
        groups: Dict[float, List[str]] = {}
        for team in active:
            groups.setdefault(points.get(team, 0), []).append(team)
        ordered_points = sorted(groups.keys(), reverse=True)
        ordered_groups = [
            sorted(groups[pts], key=lambda t: seed_index.get(t, len(seed_order)))
            for pts in ordered_points
        ]

        pairings: List[tuple] = []
        floaters: List[str] = []
        carry: List[str] = []

        for group in ordered_groups:
            # Carried floaters join the pool, re-sorted by seed for determinism.
            pool = sorted(
                list(carry) + list(group),
                key=lambda t: seed_index.get(t, len(seed_order)),
            )
            carry = []

            if len(pool) % 2 == 1:
                # Float the lowest seed (worst seed = highest index) down.
                # This can only fire on a non-last group: the upfront global
                # bye guarantees `active` is even, and by induction every
                # group's pool has the same parity as the running total, so
                # the last group's pool is always even (see the invariant
                # check below for what happens if that ever stops holding).
                floater = max(
                    pool, key=lambda t: seed_index.get(t, len(seed_order))
                )
                pool = [t for t in pool if t != floater]
                floaters.append(floater)
                carry = [floater]

            pairings.extend(SwissRoundResolver._pair_group(pool))

        if carry:
            # A floater left over after the last group means the even-active-
            # count invariant above was violated. Fail loudly instead of
            # silently dropping the team or re-assigning an existing bye.
            raise AssertionError(
                f"floater(s) {carry!r} left over with no group to join; "
                "the even-active-count invariant was violated"
            )

        pairings = SwissRoundResolver._avoid_rematches(
            pairings, previous_pairings, groups, seed_index
        )
        return SwissRoundResult(pairings=pairings, bye=bye, floaters=floaters)

    @staticmethod
    def _pair_group(pool: List[str]) -> List[tuple]:
        half = len(pool) // 2
        top, bottom = pool[:half], pool[half:]
        return [(top[i], bottom[i]) for i in range(half)]

    @staticmethod
    def _pick_bye(pool: List[str], rank_key, teams_with_bye: Set[str]) -> Optional[str]:
        # Lowest-ranked = sorted last by (points desc, seed asc).
        worst_first = sorted(pool, key=rank_key, reverse=True)
        for team in worst_first:
            if team not in teams_with_bye:
                return team
        return worst_first[0] if worst_first else None

    @staticmethod
    def _avoid_rematches(
        pairings: List[tuple],
        previous_pairings: Set[FrozenSet[str]],
        groups: Dict[float, List[str]],
        seed_index: Dict[str, int],
    ) -> List[tuple]:
        if not previous_pairings:
            return list(pairings)
        result = list(pairings)
        for i, (home, away) in enumerate(result):
            if frozenset({home, away}) not in previous_pairings:
                continue
            for j in (i + 1, i - 1):
                if 0 <= j < len(result):
                    other_home, other_away = result[j]
                    candidate_a = frozenset({home, other_away})
                    candidate_b = frozenset({other_home, away})
                    if (
                        candidate_a not in previous_pairings
                        and candidate_b not in previous_pairings
                    ):
                        result[i] = (home, other_away)
                        result[j] = (other_home, away)
                        break
        if any(
            frozenset({home, away}) in previous_pairings for home, away in result
        ):
            group_of = {
                team: pts for pts, members in groups.items() for team in members
            }
            result = SwissRoundResolver._repair_rematches_global(
                result, previous_pairings, group_of, seed_index
            )
        return result

    @staticmethod
    def _repair_rematches_global(
        pairings: List[tuple],
        previous_pairings: Set[FrozenSet[str]],
        group_of: Dict[str, float],
        seed_index: Dict[str, int],
    ) -> List[tuple]:
        """Backtracking search for the fewest-rematch perfect matching.

        Only runs when the adjacent pass above leaves repeats standing.
        Cost is lexicographic (rematches, cross-group pairs): a rematch-free
        round always beats a same-group round with repeats, and among equal
        rematch counts the pairing closest to the score-group structure wins.
        Candidates are explored in seed order with branch-and-bound pruning
        plus a node budget, so the result is deterministic and the fallback
        is never worse than the input ``pairings``.
        """

        def pair_cost(home: str, away: str) -> int:
            cost = 0
            if frozenset({home, away}) in previous_pairings:
                cost += SwissRoundResolver._REMATCH_COST
            if group_of.get(home) != group_of.get(away):
                cost += 1
            return cost

        def total_cost(pairs: List[tuple]) -> int:
            return sum(pair_cost(home, away) for home, away in pairs)

        pool = sorted(
            [team for pair in pairings for team in pair],
            key=lambda t: seed_index.get(t, len(seed_index)),
        )
        best = list(pairings)
        best_cost = total_cost(best)
        budget = [SwissRoundResolver._REPAIR_SEARCH_BUDGET]

        def candidates(team: str, remaining: Set[str]) -> List[str]:
            others = [u for u in remaining if u != team]

            def sort_key(u: str):
                return (
                    frozenset({team, u}) in previous_pairings,
                    group_of.get(team) != group_of.get(u),
                    seed_index.get(u, len(seed_index)),
                )

            return sorted(others, key=sort_key)

        def search(remaining: Set[str], current: List[tuple], cost: int) -> None:
            nonlocal best, best_cost
            if budget[0] <= 0:
                return
            budget[0] -= 1
            if not remaining:
                if cost < best_cost:
                    best = list(current)
                    best_cost = cost
                return
            team = min(remaining, key=lambda t: seed_index.get(t, len(seed_index)))
            rest = set(remaining)
            rest.discard(team)
            for partner in candidates(team, rest):
                step = pair_cost(team, partner)
                if cost + step >= best_cost:
                    continue
                next_remaining = set(rest)
                next_remaining.discard(partner)
                current.append((team, partner))
                search(next_remaining, current, cost + step)
                current.pop()

        search(set(pool), [], 0)
        return best
