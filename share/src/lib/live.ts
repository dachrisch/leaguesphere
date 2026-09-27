import { findOpponentResult, findTeamResult, isFinal } from './schedule';
import type { Snapshot } from './types';

export interface WatchedGame {
  gameId: number;
  teamId: number;
  isHome: boolean;
  opponent: string;
  gamedayName: string;
}

export function activeWatchedGames(
  snapshot: Snapshot,
  teamIds: number[]
): WatchedGame[] {
  const games: WatchedGame[] = [];
  const seen = new Set<number>();
  for (const gameday of snapshot.gamedays) {
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
