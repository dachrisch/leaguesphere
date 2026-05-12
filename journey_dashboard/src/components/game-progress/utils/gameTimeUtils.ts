import type { GameInfo } from '../../../types/progressTypes';

export function getLastGameTime(games: GameInfo[]): string | null {
  if (games.length === 0) return null;
  let lastTime = games[0].scheduled;
  for (const game of games) {
    if (game.scheduled > lastTime) {
      lastTime = game.scheduled;
    }
  }
  return lastTime;
}
