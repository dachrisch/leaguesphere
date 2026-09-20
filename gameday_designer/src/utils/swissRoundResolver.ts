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
 * - Rematch avoidance is best-effort adjacent swap, deterministic.
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
  const pairKey = (home: string, away: string): string =>
    [home, away].sort().join('|');

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

  orderedGroups.forEach((group, groupIdx) => {
    const isLastGroup = groupIdx === orderedGroups.length - 1;
    let pool = [...carry, ...group].sort(
      (a, b) => (seedIndex.get(a) ?? seedOrder.length) - (seedIndex.get(b) ?? seedOrder.length),
    );
    carry = [];

    if (pool.length % 2 === 1) {
      if (isLastGroup) {
        const fallback = pickBye(pool, compareRank, teamsWithBye);
        if (bye === null) bye = fallback;
        pool = pool.filter((t) => t !== fallback);
      } else {
        const floater = pool.reduce((worst, t) =>
          (seedIndex.get(t) ?? seedOrder.length) > (seedIndex.get(worst) ?? seedOrder.length)
            ? t
            : worst,
        );
        pool = pool.filter((t) => t !== floater);
        floaters.push(floater);
        carry = [floater];
      }
    }

    const half = Math.floor(pool.length / 2);
    for (let i = 0; i < half; i++) {
      pairings.push([pool[i], pool[half + i]]);
    }
  });

  return { pairings: avoidRematches(pairings, previousPairings, pairKey), bye, floaters };
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

function avoidRematches(
  pairings: Array<[string, string]>,
  previousPairings: ReadonlySet<string>,
  pairKey: (home: string, away: string) => string,
): Array<[string, string]> {
  if (previousPairings.size === 0) return [...pairings];
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
  return result;
}
