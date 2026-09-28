import type { Snapshot } from './types';

export interface LeagueOption {
  id: number;
  name: string;
}

/**
 * Distinct leagues the given teams played in within a snapshot scope.
 *
 * Use with a season-filtered snapshot (`?team=&season=`) to offer only the
 * leagues a club actually appeared in that season — e.g. league vs.
 * relegation, which are separate leagues in LeagueSphere.
 */
export function leaguesInSnapshot(snapshot: Snapshot): LeagueOption[] {
  const byId = new Map<number, LeagueOption>();
  for (const gameday of snapshot.gamedays) {
    if (!byId.has(gameday.league)) {
      byId.set(gameday.league, {
        id: gameday.league,
        name: gameday.league_display,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
