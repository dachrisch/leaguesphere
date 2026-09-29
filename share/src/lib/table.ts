import type { Snapshot } from './types';

/** Mirror of Django's `slugify` for season names ("2025/2026" -> "2025-2026"). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a season id from either an explicit `season` id or a `year`.
 *
 * `year` matches a season whose name starts with the year (e.g. `2026`, or
 * `2025/2026` for a season spanning two years). Explicit `season` takes
 * precedence when both are present.
 */
export function resolveSeasonId(
  seasons: { id: number; name: string }[],
  season: number | null,
  year: string | null
): number | null {
  if (season !== null) {
    return season;
  }
  if (year === null) {
    return null;
  }
  const match = seasons.find((entry) => entry.name.startsWith(year));
  return match ? match.id : null;
}

export interface LeagueCandidate {
  id: number;
  name: string;
  gameCount: number;
}

/**
 * Leagues present in the snapshot (already scoped to the resolved season),
 * ordered by number of games desc.
 *
 * The snapshot offers only display names + ids (`league`, `league_display`);
 * callers resolve each candidate's id/name to a slug via `/api/leagues/` and
 * fetch its table, falling through to the next candidate on a 404. This lets a
 * club's league win over a cup it also appeared in within the same season.
 */
export function leagueCandidates(snapshot: Snapshot): LeagueCandidate[] {
  const byId = new Map<number, LeagueCandidate>();
  for (const gameday of snapshot.gamedays) {
    const gameCount = gameday.games?.length ?? 0;
    const current = byId.get(gameday.league);
    if (current === undefined) {
      byId.set(gameday.league, {
        id: gameday.league,
        name: gameday.league_display,
        gameCount,
      });
    } else {
      current.gameCount += gameCount;
    }
  }
  return [...byId.values()].sort(
    (a, b) => b.gameCount - a.gameCount || a.name.localeCompare(b.name)
  );
}
