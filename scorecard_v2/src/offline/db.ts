/**
 * The IndexedDB schema of the offline store.
 *
 * One database per origin, opened lazily and shared by every tab: the queue has
 * to survive a reload and be visible to a second tab, so nothing is cached in
 * memory.
 *
 * Version 2 adds the `snapshots` store (Task 20): the last server payload of
 * every read the app needs to boot a running game offline. The upgrade is
 * written additively, so a device that already holds a v1 queue keeps it.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { StoredOp } from "./types";

export const DB_NAME = "scorecard-v2";
export const DB_VERSION = 2;
export const OPS_STORE = "ops";
export const SNAPSHOTS_STORE = "snapshots";
export const GAME_INDEX = "by-game";

/** One cached read: the last server payload and when it arrived. */
export interface SnapshotRecord {
  /** Stable key, see `snapshotKey` in ./snapshot.ts. */
  key: string;
  /** The server payload as it arrived; shape is per key. */
  value: unknown;
  /** `Date.now()` of the write — a device can show how old the data is. */
  updatedAt: number;
}

export interface OutboxSchema extends DBSchema {
  ops: {
    key: string;
    value: StoredOp;
    indexes: { "by-game": number };
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
  };
}

export type OutboxDatabase = IDBPDatabase<OutboxSchema>;

/**
 * How a database handle is obtained. Tests inject a factory bound to a fresh
 * `fake-indexeddb` `IDBFactory`; production uses {@link openOutboxDatabase}.
 */
export type DatabaseFactory = () => Promise<OutboxDatabase>;

export function upgradeOutbox(database: IDBPDatabase<OutboxSchema>): void {
  if (!database.objectStoreNames.contains(OPS_STORE)) {
    const store = database.createObjectStore(OPS_STORE, { keyPath: "id" });
    // Only a per-game index: one game holds hundreds of ops at most, so
    // ordering by the `seq` stamped at enqueue time is cheaper than a
    // compound index — the failed rows have to be filtered out anyway, which
    // an index on the sort key could not do.
    store.createIndex(GAME_INDEX, "gameId");
  }
  if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
    database.createObjectStore(SNAPSHOTS_STORE, { keyPath: "key" });
  }
}

export function openOutboxDatabase(): Promise<OutboxDatabase> {
  return openDB<OutboxSchema>(DB_NAME, DB_VERSION, { upgrade: upgradeOutbox });
}
