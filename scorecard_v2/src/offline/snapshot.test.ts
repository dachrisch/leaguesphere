import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { openDB } from "idb";

import { ApiError, apiGet } from "../api/client";
import {
  DB_NAME,
  DB_VERSION,
  upgradeOutbox,
  type OutboxSchema,
} from "./db";
import {
  cachedGet,
  cachedGetMeta,
  createSnapshotStore,
  readSnapshot,
  removeSnapshot,
  resetSnapshotStore,
  snapshotKey,
  writeSnapshot,
} from "./snapshot";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, apiGet: vi.fn() };
});

const apiGetMock = apiGet as unknown as Mock;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetSnapshotStore();
  apiGetMock.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("snapshot store", () => {
  it("stores a payload with its timestamp under a stable key", async () => {
    const store = createSnapshotStore();

    await store.write("gamedays", [{ id: 1 }]);
    const saved = await store.read<{ id: number }[]>("gamedays");

    expect(saved?.value).toEqual([{ id: 1 }]);
    expect(typeof saved?.updatedAt).toBe("number");
    await expect(store.read("other")).resolves.toBeUndefined();
  });

  it("clears every snapshot on logout", async () => {
    const store = createSnapshotStore();
    await store.write(snapshotKey.log(1), { gameId: 1 });
    await store.write(snapshotKey.roster(1), []);

    await store.clearAll();

    await expect(store.read(snapshotKey.log(1))).resolves.toBeUndefined();
    await expect(store.read(snapshotKey.roster(1))).resolves.toBeUndefined();
  });

  it("drops one snapshot without touching the others", async () => {
    const store = createSnapshotStore();
    await store.write(snapshotKey.log(1), { gameId: 1 });
    await store.write(snapshotKey.setup(1), { fhPossession: "home" });
    await store.write(snapshotKey.roster(1), []);

    await store.remove(snapshotKey.log(1));

    await expect(store.read(snapshotKey.log(1))).resolves.toBeUndefined();
    await expect(store.read(snapshotKey.setup(1))).resolves.toBeDefined();
    await expect(store.read(snapshotKey.roster(1))).resolves.toBeDefined();
  });
});

describe("cachedGetMeta", () => {
  it("marks a network answer as fresh and a stored one with its timestamp", async () => {
    apiGetMock.mockResolvedValue([{ id: 1 }]);

    const fresh = await cachedGetMeta<{ id: number }[]>(
      snapshotKey.gamedays(),
      "/api/gameday/list/",
    );

    expect(fresh.updatedAt).toBeNull();

    apiGetMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));
    const stored = await cachedGetMeta<{ id: number }[]>(
      snapshotKey.gamedays(),
      "/api/gameday/list/",
    );

    expect(stored.value).toEqual([{ id: 1 }]);
    expect(typeof stored.updatedAt).toBe("number");
  });
});

describe("cachedGet", () => {
  it("writes every successful read back", async () => {
    apiGetMock.mockResolvedValue([{ id: 1, name: "Tag" }]);

    const fresh = await cachedGet(snapshotKey.gamedays(), "/api/gameday/list/");

    expect(fresh).toEqual([{ id: 1, name: "Tag" }]);
    expect(apiGetMock).toHaveBeenCalledWith("/api/gameday/list/");
    const saved = await readSnapshot<{ id: number }[]>(snapshotKey.gamedays());
    expect(saved?.value).toEqual([{ id: 1, name: "Tag" }]);
  });

  it("falls back to the stored payload when the request fails", async () => {
    await writeSnapshot(snapshotKey.log(7), { gameId: 7, events: [] });
    apiGetMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

    const log = await cachedGet<{ gameId: number }>(
      snapshotKey.log(7),
      "/api/gamelog/7",
    );

    expect(log.gameId).toBe(7);
  });

  it("reads the snapshot first when the browser knows it is offline", async () => {
    await writeSnapshot(snapshotKey.penalties(), [{ name: "Holding" }]);
    vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(false);

    const penalties = await cachedGet<{ name: string }[]>(
      snapshotKey.penalties(),
      "/api/config/scorecard/penalties",
    );

    expect(penalties).toEqual([{ name: "Holding" }]);
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("still rethrows when there is neither a network nor a snapshot", async () => {
    apiGetMock.mockRejectedValue(new ApiError(500, null, "Server weg"));

    await expect(
      cachedGet(snapshotKey.games(3), "/api/gameday/3/officials/crew"),
    ).rejects.toThrow("Server weg");
  });
});

describe("a failing store open", () => {
  it("retries instead of caching the failure", async () => {
    const failure = new Error("kein Zugriff");
    let attempts = 0;
    const store = createSnapshotStore(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(failure);
      }
      return openDB<OutboxSchema>(DB_NAME, DB_VERSION, {
        upgrade: upgradeOutbox,
      });
    });

    await expect(store.read("gamedays")).rejects.toBe(failure);

    await expect(store.read("gamedays")).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });

  it("reads an unavailable store as no snapshot", async () => {
    vi.stubGlobal("indexedDB", undefined);
    resetSnapshotStore();

    await expect(readSnapshot("gamedays")).resolves.toBeUndefined();
  });

  it("ignores an impossible read through the module helpers", async () => {
    // A remove/write on a store that never opened must still resolve: these
    // helpers are best effort by contract.
    await expect(removeSnapshot("nie-geschrieben")).resolves.toBeUndefined();
  });
});
