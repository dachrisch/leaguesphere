import { findOpponentResult, findTeamResult, isFinal, todayIso } from './schedule';
import type { Snapshot } from './types';

export interface WatchedGame {
  gameId: number;
  teamId: number;
  isHome: boolean;
  opponent: string;
  gamedayName: string;
}

/**
 * Non-final games for the watched teams scheduled **today**.
 *
 * Restricting to today's gamedays keeps the widget from polling the
 * liveticker forever for a stale open game (e.g. a 2023 fixture that was
 * never marked final).
 */
export function activeWatchedGames(
  snapshot: Snapshot,
  teamIds: number[],
  today: string = todayIso()
): WatchedGame[] {
  const games: WatchedGame[] = [];
  const seen = new Set<number>();
  for (const gameday of snapshot.gamedays) {
    if (gameday.date !== today) {
      continue;
    }
    for (const game of gameday.games ?? []) {
      if (isFinal(game.status) || seen.has(game.id)) {
        continue;
      }
      const teamId = teamIds.find(
        (candidate) => findTeamResult(game, candidate) !== null
      );
      if (teamId === undefined) {
        continue;
      }
      const own = findTeamResult(game, teamId);
      if (own === null) {
        continue;
      }
      seen.add(game.id);
      games.push({
        gameId: game.id,
        teamId,
        isHome: own.isHome,
        opponent: findOpponentResult(game, teamId)?.team_name ?? '',
        gamedayName: gameday.name,
      });
    }
  }
  return games;
}
