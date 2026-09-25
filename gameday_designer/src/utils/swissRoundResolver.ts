/**
 * Swiss-system round resolver (issue #1970, JLT Flag 2026 rules).
 *
 * Mirrors `gameday_designer/service/swiss_round_resolver.py` — keep the two
 * in sync. Pure function, no backend calls:
 * - Group by points (desc); order within group by pre-tournament seed.
 * - Top half of each group plays the bottom half (`top[i]` vs `bottom[i]`).
 * - Odd-sized groups float their lowest seed down to the next-lower group.
 * - Odd active-team count yields exactly one bye, assigned first to the
 *   lowest-ranked team (points, then seed) without one yet (worth 2 pts).
 * - Rematch avoidance is two-stage, deterministic: first an adjacent swap
 *   (a repeated pairing swaps away teams with a neighbour when that
 *   resolves both without creating a new rematch), then — only if rematches
 *   remain — a bounded backtracking search over the round pool for the
 *   pairing with the fewest rematches (cross-group pairs only break ties,
 *   so the same-group structure wins whenever it is rematch-free).
 *
 * v1 rulings: bye is a standings-only adjustment (no synthetic game row);
 * final-ranking tie-breaks out of scope (points, then seed).
 */

export interface SwissRoundResult {
  pairings: Array<[string, string]>;
  bye: string | null;
  floaters: string[];
}

export const SWISS_BYE_POINTS = 2;

export function resolveSwissRound(
  seedOrder: string[],
  points: Record<string, number> = {},
  teamsWithBye: ReadonlySet<string> = new Set(),
  previousPairings: ReadonlySet<string> = new Set(),
): SwissRoundResult {
  const seedIndex = new Map(seedOrder.map((team, i) => [team, i]));
  const rankKey = (team: string): [number, number] => [
    -(points[team] ?? 0),
    seedIndex.get(team) ?? seedOrder.length,
  ];
  const compareRank = (a: string, b: string): number => {
    const [pa, sa] = rankKey(a);
    const [pb, sb] = rankKey(b);
    return pa - pb || sa - sb;
  };

  // Odd count => exactly one bye, assigned first globally.
  let bye: string | null = null;
  let active = [...seedOrder];
  if (active.length % 2 === 1) {
    bye = pickBye(active, compareRank, teamsWithBye);
    active = active.filter((t) => t !== bye);
  }

  // Group remainder by points (desc), members by seed.
  const byPoints = new Map<number, string[]>();
  for (const team of active) {
    const pts = points[team] ?? 0;
    if (!byPoints.has(pts)) byPoints.set(pts, []);
    byPoints.get(pts)?.push(team);
  }
  const orderedGroups = [...byPoints.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, teams]) =>
      [...teams].sort(
        (a, b) => (seedIndex.get(a) ?? seedOrder.length) - (seedIndex.get(b) ?? seedOrder.length),
      ),
    );

  const pairings: Array<[string, string]> = [];
  const floaters: string[] = [];
  let carry: string[] = [];

  for (const group of orderedGroups) {
    let pool = [...carry, ...group].sort(
      (a, b) => (seedIndex.get(a) ?? seedOrder.length) - (seedIndex.get(b) ?? seedOrder.length),
    );
    carry = [];

    if (pool.length % 2 === 1) {
      // Float the lowest seed (worst seed = highest index) down. This can
      // only fire on a non-last group: the upfront global bye guarantees
      // `active` is even, and by induction every group's pool has the same
      // parity as the running total, so the last group's pool is always
      // even (see the invariant check below for what happens if that ever
      // stops holding).
      const floater = pool.reduce((worst, t) =>
        (seedIndex.get(t) ?? seedOrder.length) > (seedIndex.get(worst) ?? seedOrder.length)
          ? t
          : worst,
      );
      pool = pool.filter((t) => t !== floater);
      floaters.push(floater);
      carry = [floater];
    }

    const half = Math.floor(pool.length / 2);
    for (let i = 0; i < half; i++) {
      pairings.push([pool[i], pool[half + i]]);
    }
  }

  if (carry.length > 0) {
    // A floater left over after the last group means the even-active-count
    // invariant above was violated. Fail loudly instead of silently
    // dropping the team or re-assigning an existing bye.
    throw new Error(
      `floater(s) ${JSON.stringify(carry)} left over with no group to join; ` +
        'the even-active-count invariant was violated',
    );
  }

  return {
    pairings: avoidRematches(pairings, previousPairings, orderedGroups, seedIndex),
    bye,
    floaters,
  };
}

function pickBye(
  pool: string[],
  compareRank: (a: string, b: string) => number,
  teamsWithBye: ReadonlySet<string>,
): string | null {
  if (pool.length === 0) return null;
  const worstFirst = [...pool].sort(compareRank).reverse();
  return worstFirst.find((t) => !teamsWithBye.has(t)) ?? worstFirst[0];
}

const REMATCH_COST = 1000;
const REPAIR_SEARCH_BUDGET = 20000;

function avoidRematches(
  pairings: Array<[string, string]>,
  previousPairings: ReadonlySet<string>,
  orderedGroups: string[][],
  seedIndex: Map<string, number>,
): Array<[string, string]> {
  if (previousPairings.size === 0) return [...pairings];
  const pairKey = (home: string, away: string): string =>
    [home, away].sort().join('|');
  const result: Array<[string, string]> = pairings.map((p) => [...p] as [string, string]);
  for (let i = 0; i < result.length; i++) {
    const [home, away] = result[i];
    if (!previousPairings.has(pairKey(home, away))) continue;
    for (const j of [i + 1, i - 1]) {
      if (j < 0 || j >= result.length) continue;
      const [otherHome, otherAway] = result[j];
      if (
        !previousPairings.has(pairKey(home, otherAway)) &&
        !previousPairings.has(pairKey(otherHome, away))
      ) {
        result[i] = [home, otherAway];
        result[j] = [otherHome, away];
        break;
      }
    }
  }
  if (result.some(([home, away]) => previousPairings.has(pairKey(home, away)))) {
    const groupOf = new Map<string, number>();
    orderedGroups.forEach((members, groupIdx) => {
      members.forEach((team) => groupOf.set(team, groupIdx));
    });
    return repairRematchesGlobal(result, previousPairings, groupOf, seedIndex);
  }
  return result;
}

function repairRematchesGlobal(
  pairings: Array<[string, string]>,
  previousPairings: ReadonlySet<string>,
  groupOf: Map<string, number>,
  seedIndex: Map<string, number>,
): Array<[string, string]> {
  const pairKey = (home: string, away: string): string =>
    [home, away].sort().join('|');
  const seedPos = (team: string): number => seedIndex.get(team) ?? seedIndex.size;
  const pairCost = (home: string, away: string): number =>
    (previousPairings.has(pairKey(home, away)) ? REMATCH_COST : 0) +
    (groupOf.get(home) !== groupOf.get(away) ? 1 : 0);
  const totalCost = (pairs: Array<[string, string]>): number =>
    pairs.reduce((sum, [home, away]) => sum + pairCost(home, away), 0);

  const pool = [...new Set(pairings.flat())].sort((a, b) => seedPos(a) - seedPos(b));
  let best: Array<[string, string]> = pairings.map((p) => [...p] as [string, string]);
  let bestCost = totalCost(best);
  let budget = REPAIR_SEARCH_BUDGET;

  const search = (remaining: Set<string>, current: Array<[string, string]>, cost: number): void => {
    if (budget <= 0) return;
    budget -= 1;
    if (remaining.size === 0) {
      if (cost < bestCost) {
        best = current.map((p) => [...p] as [string, string]);
        bestCost = cost;
      }
      return;
    }
    const team = [...remaining].sort((a, b) => seedPos(a) - seedPos(b))[0];
    const partners = [...remaining]
      .filter((u) => u !== team)
      .sort((a, b) => {
        const ra = previousPairings.has(pairKey(team, a)) ? 1 : 0;
        const rb = previousPairings.has(pairKey(team, b)) ? 1 : 0;
        if (ra !== rb) return ra - rb;
        const ga = groupOf.get(team) !== groupOf.get(a) ? 1 : 0;
        const gb = groupOf.get(team) !== groupOf.get(b) ? 1 : 0;
        if (ga !== gb) return ga - gb;
        return seedPos(a) - seedPos(b);
      });
    for (const partner of partners) {
      const step = pairCost(team, partner);
      if (cost + step >= bestCost) continue;
      const next = new Set(remaining);
      next.delete(team);
      next.delete(partner);
      current.push([team, partner]);
      search(next, current, cost + step);
      current.pop();
    }
  };

  search(new Set(pool), [], 0);
  return best;
}
