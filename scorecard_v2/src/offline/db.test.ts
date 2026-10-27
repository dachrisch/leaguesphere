// Installs the IndexedDB globals idb and the tests rely on (`IDBRequest`,
// `IDBKeyRange`, …). jsdom ships none of them.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DB_NAME,
  DB_VERSION,
  GAME_INDEX,
  OPS_STORE,
  SNAPSHOTS_STORE,
  openOutboxDatabase,
} from "./db";
import type { StoredOp } from "./types";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

const RECORD: StoredOp = {
  id: "op-1",
  gameId: 7,
  kind: "possession",
  payload: { team: "Heim" },
  createdAt: 1,
  attempts: 0,
  deviceId: null,
  seq: 1,
  failed: false,
  failedReason: null,
  failedAt: null,
};

describe("openOutboxDatabase", () => {
  it("creates the ops and snapshots stores", async () => {
    const db = await openOutboxDatabase();

    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual([OPS_STORE, SNAPSHOTS_STORE]);

    const store = db.transaction(OPS_STORE).store;
    expect(store.keyPath).toBe("id");
    expect([...store.indexNames]).toEqual([GAME_INDEX]);
    expect(store.index(GAME_INDEX).keyPath).toBe("gameId");
    expect(store.index(GAME_INDEX).unique).toBe(false);

    // Snapshots are keyed by their stable name, not an auto-increment.
    const snapshots = db.transaction(SNAPSHOTS_STORE).store;
    expect(snapshots.keyPath).toBe("key");

    db.close();
  });

  it("keeps the rows when a second connection opens the same database", async () => {
    const first = await openOutboxDatabase();
    await first.add(OPS_STORE, RECORD);
    first.close();

    const second = await openOutboxDatabase();

    expect(await second.get(OPS_STORE, "op-1")).toEqual(RECORD);
    expect(await second.getAllFromIndex(OPS_STORE, GAME_INDEX, 7)).toEqual([
      RECORD,
    ]);
    second.close();
  });

  it("does not re-run the schema upgrade for an existing database", async () => {
    const first = await openOutboxDatabase();
    first.close();

    const second = await openOutboxDatabase();

    expect([...second.objectStoreNames]).toEqual([OPS_STORE, SNAPSHOTS_STORE]);
    second.close();
  });

  it("keeps a v1 queue when it adds the snapshot store", async () => {
    // A device that installed before Task 20: version 1 has only the queue.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore(OPS_STORE, {
          keyPath: "id",
        });
        store.createIndex(GAME_INDEX, "gameId");
      },
    });
    await v1.add(OPS_STORE, RECORD);
    v1.close();

    const upgraded = await openOutboxDatabase();

    expect(upgraded.version).toBe(DB_VERSION);
    expect([...upgraded.objectStoreNames]).toEqual([
      OPS_STORE,
      SNAPSHOTS_STORE,
    ]);
    expect(await upgraded.get(OPS_STORE, "op-1")).toEqual(RECORD);
    upgraded.close();
  });
});
