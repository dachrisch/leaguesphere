import { findTeamResult } from './schedule';
import type { Snapshot } from './types';

export interface LeagueOption {
  id: number;
  name: string;
}

function hasWatchedTeam(
  gameday: Snapshot['gamedays'][number],
  teamIds: number[]
): boolean {
  return (gameday.games ?? []).some((game) =>
    teamIds.some((teamId) => findTeamResult(game, teamId) !== null)
  );
}

/**
 * Newest season (by gameday date) in which one of the watched teams plays.
 *
 * Used as the default scope when the URL sets neither `season` nor `year`, so
 * a club's embed does not silently span every season the snapshot contains.
 */
export function latestSeasonDisplay(
  snapshot: Snapshot,
  teamIds: number[]
): string | null {
  const newestDateBySeason = new Map<string, string>();
  for (const gameday of snapshot.gamedays) {
    if (!hasWatchedTeam(gameday, teamIds)) {
      continue;
    }
    const current = newestDateBySeason.get(gameday.season_display);
    if (current === undefined || gameday.date > current) {
      newestDateBySeason.set(gameday.season_display, gameday.date);
    }
  }
  let best: { season: string; date: string } | null = null;
  for (const [season, date] of newestDateBySeason) {
    if (
      best === null ||
      date > best.date ||
      (date === best.date && season > best.season)
    ) {
      best = { season, date };
    }
  }
  return best === null ? null : best.season;
}

/** Restrict a snapshot to the latest season the watched teams play in. */
export function filterToLatestSeason(
  snapshot: Snapshot,
  teamIds: number[]
): Snapshot {
  const season = latestSeasonDisplay(snapshot, teamIds);
  if (season === null) {
    return snapshot;
  }
  return {
    ...snapshot,
    gamedays: snapshot.gamedays.filter(
      (gameday) => gameday.season_display === season
    ),
  };
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
