/**
 * Every read the flow needs, each with its offline fallback.
 *
 * `cachedGet` already does "API first, snapshot second"; the games list is the
 * one endpoint whose snapshot also has to remember the team it was fetched for
 * (an offline boot cannot ask who is logged in).
 */
import { ApiError, apiGet } from "../api/client";
import type { Gameday, Game, GameLog } from "../api/types";
import {
  cachedGet,
  cachedGetMeta,
  readSnapshot,
  removeSnapshot,
  snapshotKey,
  writeSnapshot,
  type Fetched,
} from "../offline/snapshot";

export interface CurrentUser {
  id: number;
  username: string;
}

/** The games list is stored with the team it was fetched for. */
interface GamesSnapshot {
  team: string;
  games: Game[];
}

export function loadUser(): Promise<CurrentUser> {
  // Mounted at "accounts/", not under "api/"; the session cookie authenticates
  // it (DRF's SessionAuthentication is enabled for exactly this).
  return cachedGet<CurrentUser>(snapshotKey.user(), "/accounts/auth/user/");
}

export function loadGamedays(): Promise<Gameday[]> {
  return cachedGet<Gameday[]>(snapshotKey.gamedays(), "/api/gameday/list/");
}

/**
 * Games of one gameday with the age of the answer. `team` is the official's
 * username (the old app's rule) or `*` for the whole gameday.
 *
 * Offline the snapshot wins without a request even when the team cannot be
 * resolved: the stored list belongs to this gameday, which is all a device
 * that must show a running game needs.
 */
export async function loadGamesMeta(
  gamedayId: number,
  team: string,
): Promise<Fetched<Game[]>> {
  const key = snapshotKey.games(gamedayId);
  if (globalThis.navigator?.onLine === false) {
    const saved = await readSnapshot<GamesSnapshot>(key);
    if (saved !== undefined) {
      return { value: saved.value.games, updatedAt: saved.updatedAt };
    }
  }
  try {
    const path = `/api/gameday/${gamedayId}/officials/${encodeURIComponent(
      team,
    )}`;
    const games = await apiGet<Game[]>(path);
    await writeSnapshot<GamesSnapshot>(key, { team, games });
    return { value: games, updatedAt: null };
  } catch (error) {
    const saved = await readSnapshot<GamesSnapshot>(key);
    if (saved !== undefined) {
      return { value: saved.value.games, updatedAt: saved.updatedAt };
    }
    throw error;
  }
}

export function loadGames(gamedayId: number, team: string): Promise<Game[]> {
  return loadGamesMeta(gamedayId, team).then((fetched) => fetched.value);
}

export function loadLog(gameId: number): Promise<GameLog> {
  return cachedGet<GameLog>(snapshotKey.log(gameId), `/api/gamelog/${gameId}`);
}

export function loadLogMeta(gameId: number): Promise<Fetched<GameLog>> {
  return cachedGetMeta<GameLog>(
    snapshotKey.log(gameId),
    `/api/gamelog/${gameId}`,
  );
}

/**
 * Write a finished game into the games snapshot, so an offline boot shows it
 * as `beendet` instead of reopening a game that ended an hour ago.
 *
 * Only an existing snapshot is touched: without one there is no list to keep
 * honest, and the next online read replaces it anyway.
 */
export async function markGameFinished(
  gamedayId: number,
  gameId: number,
): Promise<void> {
  const key = snapshotKey.games(gamedayId);
  const saved = await readSnapshot<GamesSnapshot>(key);
  if (saved === undefined) {
    return;
  }
  const games = saved.value.games.map((game) =>
    game.id === gameId ? { ...game, status: "beendet" as const } : game,
  );
  await writeSnapshot<GamesSnapshot>(key, { ...saved.value, games });
}

/**
 * Drop the per-game preload of a finished game.
 *
 * The log keeps a finished game writable if the app boots from it: the game
 * list would show `beendet` and the log would reopen as a running game. The
 * setup is dropped for the same reason, and the crew positions with it: they
 * are keyed per game, a finished game never opens the preparation screen, and
 * keeping them would leave one entry per finished game on the device.
 *
 * The roster and the penalty catalogue stay: they are read-only suggestions
 * and are not tied to the game's lifecycle.
 */
export async function dropGameSnapshots(gameId: number): Promise<void> {
  await Promise.all([
    removeSnapshot(snapshotKey.log(gameId)),
    removeSnapshot(snapshotKey.setup(gameId)),
    removeSnapshot(snapshotKey.crewPositions(gameId)),
  ]);
}

/** A message a panel can show; `ApiError.detail` is the server's own text. */
export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = error.detail?.trim();
    if (detail !== undefined && detail !== "") {
      return detail;
    }
  }
  return fallback;
}
