import type { Game } from "./types";

export const isLive = (game: Game): boolean =>
  game.status === "1. Halbzeit" || game.status === "2. Halbzeit";

export const isFinished = (game: Game): boolean => game.status === "beendet";

export function selectLiveGames(games: Game[]): Game[] {
  return games.filter(isLive);
}

export function selectLiveGame(games: Game[]): Game | null {
  return games.find(isLive) ?? null;
}

export function selectFinishedGame(games: Game[]): Game | null {
  return games.find(isFinished) ?? null;
}

export function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isDelayed(game: Game, now: Date): boolean {
  if (game.status !== "Geplant") return false;
  const scheduled = toMinutes(game.time);
  if (scheduled === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current - scheduled >= 5;
}

export function minutesUntil(game: Game, now: Date): number | null {
  const scheduled = toMinutes(game.time);
  if (scheduled === null) return null;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, scheduled - current);
}

export function selectNextGame(games: Game[], now: Date): Game | null {
  const scheduled = games
    .filter((game) => game.status === "Geplant" && toMinutes(game.time) !== null)
    .sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0));
  return scheduled.find((game) => !isDelayed(game, now)) ?? scheduled[0] ?? null;
}
