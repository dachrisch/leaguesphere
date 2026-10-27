// Installs the IndexedDB globals idb and the tests rely on (`IDBRequest`,
// `IDBKeyRange`, …). jsdom ships none of them.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DB_NAME,
  DB_VERSION,
  GAME_INDEX,
  OPS_STORE,
  openOutboxDatabase,
} from "./db";
import type { StoredOp } from "./types";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("openOutboxDatabase", () => {
  it("creates version 1 with the ops store keyed by id", async () => {
    const db = await openOutboxDatabase();

    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual([OPS_STORE]);

    const store = db.transaction(OPS_STORE).store;
    expect(store.keyPath).toBe("id");
    expect([...store.indexNames]).toEqual([GAME_INDEX]);
    expect(store.index(GAME_INDEX).keyPath).toBe("gameId");
    expect(store.index(GAME_INDEX).unique).toBe(false);

    db.close();
  });

  it("keeps the rows when a second connection opens the same database", async () => {
    const record: StoredOp = {
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
    const first = await openOutboxDatabase();
    await first.add(OPS_STORE, record);
    first.close();

    const second = await openOutboxDatabase();

    expect(await second.get(OPS_STORE, "op-1")).toEqual(record);
    expect(await second.getAllFromIndex(OPS_STORE, GAME_INDEX, 7)).toEqual([
      record,
    ]);
    second.close();
  });

  it("does not re-run the schema upgrade for an existing database", async () => {
    const first = await openOutboxDatabase();
    first.close();

    const second = await openOutboxDatabase();

    expect([...second.objectStoreNames]).toEqual([OPS_STORE]);
    second.close();
  });
});
