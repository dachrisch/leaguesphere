/**
 * The offline preload (Task 20).
 *
 * The service worker never caches `/api/**` — those answers are per-user, and a
 * cached response would leak the previous official's game on a shared device.
 * The preload is the alternative: every successful read writes its payload to
 * IndexedDB, and a tab that boots with no network reads it back so a running
 * game (and its log) still opens.
 *
 * Two rules keep it honest:
 *
 * - **Server data only.** The optimistic log built from the outbox is never
 *   stored; a reload rebuilds it from the last server payload plus the queued
 *   ops. That keeps "the server payload always wins" true across a reload.
 * - **Best effort.** A snapshot write failure (private mode, quota, a browser
 *   without IndexedDB) must never fail the read that produced it.
 */
import { apiGet, type RequestOptions } from "../api/client";
import {
  SNAPSHOTS_STORE,
  openOutboxDatabase,
  type DatabaseFactory,
  type OutboxDatabase,
  type SnapshotRecord,
} from "./db";

/** Every key the app preloads. Games are keyed per gameday, the rest per game. */
export const snapshotKey = {
  gamedays: (): string => "gamedays",
  user: (): string => "user",
  games: (gamedayId: number): string => `games:${gamedayId}`,
  log: (gameId: number): string => `log:${gameId}`,
  setup: (gameId: number): string => `setup:${gameId}`,
  roster: (gameId: number): string => `roster:${gameId}`,
  // The league's crew slots; labels are configuration, so a device that
  // reloads offline still shows the right role names.
  crewPositions: (gameId: number): string => `crewpositions:${gameId}`,
  penalties: (): string => "penalties",
  // The team directory is public and not tied to a game, so one key holds the
  // name→logo lookup for every screen (`api/teams.ts`).
  teams: (): string => "teams",
};

/** The games list snapshot carries the team it was fetched for. */
export interface GamesSnapshot {
  team: string;
  games: unknown;
}

export interface StoredSnapshot<T> {
  value: T;
  updatedAt: number;
}

export interface SnapshotStore {
  read<T>(key: string): Promise<StoredSnapshot<T> | undefined>;
  write<T>(key: string, value: T): Promise<void>;
  /** Drop one cached read (a game that has ended, a stale setup). */
  remove(key: string): Promise<void>;
  /** Drop every cached read (logout). */
  clearAll(): Promise<void>;
}

export function createSnapshotStore(
  open: DatabaseFactory = openOutboxDatabase,
): SnapshotStore {
  // One connection per store, opened on first use — constructing the store
  // during boot must not touch IndexedDB.
  let connection: Promise<OutboxDatabase> | null = null;

  function database(): Promise<OutboxDatabase> {
    if (connection === null) {
      connection = open().catch((error: unknown) => {
        connection = null;
        throw error;
      });
    }
    return connection;
  }

  return {
    async read<T>(key: string): Promise<StoredSnapshot<T> | undefined> {
      const db = await database();
      const record = await db.get(SNAPSHOTS_STORE, key);
      if (record === undefined) {
        return undefined;
      }
      return { value: record.value as T, updatedAt: record.updatedAt };
    },

    async write<T>(key: string, value: T): Promise<void> {
      const db = await database();
      const record: SnapshotRecord = { key, value, updatedAt: Date.now() };
      await db.put(SNAPSHOTS_STORE, record);
    },

    async remove(key: string): Promise<void> {
      const db = await database();
      await db.delete(SNAPSHOTS_STORE, key);
    },

    async clearAll(): Promise<void> {
      const db = await database();
      await db.clear(SNAPSHOTS_STORE);
    },
  };
}

let defaultStore: SnapshotStore | null = null;

/** The app-wide store. Tests build their own with {@link createSnapshotStore}. */
export function snapshots(): SnapshotStore {
  if (defaultStore === null) {
    defaultStore = createSnapshotStore();
  }
  return defaultStore;
}

/** Test hook: drop the memoised store so a fresh IndexedDB is picked up. */
export function resetSnapshotStore(): void {
  defaultStore = null;
}

export async function readSnapshot<T>(
  key: string,
): Promise<StoredSnapshot<T> | undefined> {
  try {
    return await snapshots().read<T>(key);
  } catch {
    return undefined;
  }
}

/** Store a server payload. Resolves even when IndexedDB is unavailable. */
export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  try {
    await snapshots().write(key, value);
  } catch {
    // A device without a working IndexedDB still runs online.
  }
}

/** Drop one cached read. Resolves even when IndexedDB is unavailable. */
export async function removeSnapshot(key: string): Promise<void> {
  try {
    await snapshots().remove(key);
  } catch {
    // Same as a failed write: the next online read refreshes it anyway.
  }
}

/** A read that says where its payload came from. */
export interface Fetched<T> {
  value: T;
  /**
   * When the cached copy was stored, or `null` when the value came from the
   * network just now. A screen shows a "Zwischengespeichert" hint for a value
   * that is older than this render.
   */
  updatedAt: number | null;
}

/**
 * {@link cachedGet} with the age of the answer.
 *
 * Same rules — the network wins, the snapshot is the fallback — but the caller
 * learns whether it is looking at a stored payload, which is the difference
 * between "the game is running" and "the game was running when we last had a
 * connection".
 */
export async function cachedGetMeta<T>(
  key: string,
  path: string,
  opts?: RequestOptions,
): Promise<Fetched<T>> {
  if (globalThis.navigator?.onLine === false) {
    const saved = await readSnapshot<T>(key);
    if (saved !== undefined) {
      return { value: saved.value, updatedAt: saved.updatedAt };
    }
  }
  try {
    const fresh =
      opts === undefined ? await apiGet<T>(path) : await apiGet<T>(path, opts);
    await writeSnapshot(key, fresh);
    return { value: fresh, updatedAt: null };
  } catch (error) {
    const saved = await readSnapshot<T>(key);
    if (saved !== undefined) {
      return { value: saved.value, updatedAt: saved.updatedAt };
    }
    throw error;
  }
}

/**
 * Read `path`, refresh its snapshot, and fall back to the last stored payload
 * when the request fails (offline, 5xx, an aborted connection).
 *
 * When the browser already knows it is offline the snapshot is read first, so
 * a field device does not wait for a request that cannot succeed. A missing
 * snapshot still tries the network: `navigator.onLine === false` is a hint, not
 * a guarantee.
 */
export async function cachedGet<T>(key: string, path: string): Promise<T> {
  return (await cachedGetMeta<T>(key, path)).value;
}
