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

const FIVE_MINUTES = 5 * 60 * 1000;

export function isDelayed(game: Game, now: Date): boolean {
  if (game.status !== "Geplant" || !game.scheduled_at) return false;
  const scheduled = Date.parse(game.scheduled_at);
  if (Number.isNaN(scheduled)) return false;
  return now.getTime() - scheduled >= FIVE_MINUTES;
}

export function minutesUntil(game: Game, now: Date): number | null {
  if (!game.scheduled_at) return null;
  const scheduled = Date.parse(game.scheduled_at);
  if (Number.isNaN(scheduled)) return null;
  return Math.max(0, Math.ceil((scheduled - now.getTime()) / 60000));
}

export function selectNextGame(games: Game[], now: Date): Game | null {
  const scheduled = games
    .filter(
      (game) => game.status === "Geplant" && !Number.isNaN(Date.parse(game.scheduled_at)),
    )
    .sort(
      (a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at),
    );
  return scheduled.find((game) => !isDelayed(game, now)) ?? scheduled[0] ?? null;
}

