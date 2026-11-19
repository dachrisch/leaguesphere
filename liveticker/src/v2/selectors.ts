import type { Game, GamedayGroup } from "./types";

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
  return selectFinishedGames(games)[0] ?? null;
}

const kickoff = (game: Game): number => {
  const value = Date.parse(game.scheduled_at);
  return Number.isNaN(value) ? 0 : value;
};

/** The games still to be played, earliest kickoff first. */
export function selectUpcomingGames(games: Game[]): Game[] {
  return games
    .filter((game) => game.status === "Geplant")
    .sort((a, b) => kickoff(a) - kickoff(b));
}

/** Every finished game the payload holds, newest kickoff first. */
export function selectFinishedGames(games: Game[]): Game[] {
  return games.filter(isFinished).sort((a, b) => kickoff(b) - kickoff(a));
}

/** One section per gameday, so several leagues keep their own header. */
export function groupGamesByGameday(games: Game[]): GamedayGroup[] {
  const groups = new Map<number, GamedayGroup>();
  for (const game of games) {
    const existing = groups.get(game.gameday.id);
    if (existing) {
      existing.games.push(game);
      continue;
    }
    groups.set(game.gameday.id, {
      gameday: game.gameday,
      league: game.league,
      games: [game],
    });
  }
  return [...groups.values()];
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

