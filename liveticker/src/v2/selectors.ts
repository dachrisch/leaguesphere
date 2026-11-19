import type { Game } from "./types";

export const isLive = (game: Game): boolean =>
  game.status === "1. Halbzeit" || game.status === "2. Halbzeit";

export function selectLiveGame(games: Game[]): Game | null {
  return games.find(isLive) ?? null;
}
