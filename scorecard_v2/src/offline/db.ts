/**
 * The IndexedDB schema of the offline store.
 *
 * One database per origin, opened lazily and shared by every tab: the queue has
 * to survive a reload and be visible to a second tab, so nothing is cached in
 * memory. A later task (the preload in Task 20) adds stores by bumping
 * {@link DB_VERSION}; {@link upgradeOutbox} is written additively so an
 * existing v1 database keeps the queue it already holds.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { StoredOp } from "./types";

export const DB_NAME = "scorecard-v2";
export const DB_VERSION = 1;
export const OPS_STORE = "ops";
export const GAME_INDEX = "by-game";

export interface OutboxSchema extends DBSchema {
  ops: {
    key: string;
    value: StoredOp;
    indexes: { "by-game": number };
  };
}

export type OutboxDatabase = IDBPDatabase<OutboxSchema>;

/**
 * How a database handle is obtained. Tests inject a factory bound to a fresh
 * `fake-indexeddb` `IDBFactory`; production uses {@link openOutboxDatabase}.
 */
export type DatabaseFactory = () => Promise<OutboxDatabase>;

export function upgradeOutbox(database: IDBPDatabase<OutboxSchema>): void {
  if (database.objectStoreNames.contains(OPS_STORE)) {
    return;
  }
  const store = database.createObjectStore(OPS_STORE, { keyPath: "id" });
  // Only a per-game index: one game holds hundreds of ops at most, so ordering
  // by `createdAt` in memory is cheaper than a compound index — the failed rows
  // have to be filtered out anyway, which an index on the sort key could not
  // do.
  store.createIndex(GAME_INDEX, "gameId");
}

export function openOutboxDatabase(): Promise<OutboxDatabase> {
  return openDB<OutboxSchema>(DB_NAME, DB_VERSION, { upgrade: upgradeOutbox });
}
