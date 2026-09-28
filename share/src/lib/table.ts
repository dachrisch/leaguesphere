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

export interface LeagueSeason {
  leagueName: string;
  seasonName: string;
}

/**
 * The most recent league+season the given teams actually play in.
 *
 * The league-table API is keyed by slugs, but the snapshot only exposes
 * display names (`league_display`, `season_display`). Callers therefore
 * resolve the league name to its slug via `/api/leagues/` and fetch the
 * table without a season, which the API resolves to the latest season.
 */
export function pickLeagueSeason(
  snapshot: Snapshot,
  teamIds: number[]
): LeagueSeason | null {
  let best: (LeagueSeason & { date: string }) | null = null;
  for (const gameday of snapshot.gamedays) {
    const plays = (gameday.games ?? []).some((game) =>
      game.results.some(
        (result) => result.team_id !== null && teamIds.includes(result.team_id)
      )
    );
    if (!plays) {
      continue;
    }
    if (best === null || gameday.date > best.date) {
      best = {
        date: gameday.date,
        leagueName: gameday.league_display,
        seasonName: gameday.season_display,
      };
    }
  }
  if (best === null) {
    return null;
  }
  return { leagueName: best.leagueName, seasonName: best.seasonName };
}
