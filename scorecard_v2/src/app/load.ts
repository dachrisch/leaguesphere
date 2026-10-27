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
  readSnapshot,
  snapshotKey,
  writeSnapshot,
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
 * Games of one gameday. `team` is the official's username (the old app's
 * rule) or `*` for the whole gameday.
 *
 * Offline the snapshot wins without a request even when the team cannot be
 * resolved: the stored list belongs to this gameday, which is all a device
 * that must show a running game needs.
 */
export async function loadGames(
  gamedayId: number,
  team: string,
): Promise<Game[]> {
  const key = snapshotKey.games(gamedayId);
  if (globalThis.navigator?.onLine === false) {
    const saved = await readSnapshot<GamesSnapshot>(key);
    if (saved !== undefined) {
      return saved.value.games;
    }
  }
  try {
    const path = `/api/gameday/${gamedayId}/officials/${encodeURIComponent(
      team,
    )}`;
    const games = await apiGet<Game[]>(path);
    await writeSnapshot<GamesSnapshot>(key, { team, games });
    return games;
  } catch (error) {
    const saved = await readSnapshot<GamesSnapshot>(key);
    if (saved !== undefined) {
      return saved.value.games;
    }
    throw error;
  }
}

export function loadLog(gameId: number): Promise<GameLog> {
  return cachedGet<GameLog>(snapshotKey.log(gameId), `/api/gamelog/${gameId}`);
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
