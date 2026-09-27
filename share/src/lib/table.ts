import type { Snapshot } from './types';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface LeagueSeason {
  leagueName: string;
  seasonName: string;
}

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
