// Installs the IndexedDB globals idb and the tests rely on (`IDBRequest`,
// `IDBKeyRange`, …). jsdom ships none of them.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DB_VERSION,
  upgradeOutbox,
  type OutboxSchema,
} from "./db";
import { createOutbox, DuplicateOpError } from "./outbox";
import type { PendingOp } from "./types";

function op(overrides: Partial<PendingOp> = {}): PendingOp {
  return {
    id: "op-1",
    gameId: 1,
    kind: "event",
    payload: { name: "Touchdown", player: { jersey: 7 } },
    createdAt: 1_000,
    attempts: 0,
    deviceId: "device-a",
    ...overrides,
  };
}

let outbox = createOutbox();

beforeEach(() => {
  // A fresh factory per test: same database name, empty data, and no handles
  // left over from the previous test.
  vi.stubGlobal("indexedDB", new IDBFactory());
  outbox = createOutbox();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enqueue and pending", () => {
  it("keeps one game's ops in insertion order", async () => {
    // `createdAt` says the opposite; the queue order is what the official
    // tapped, so `seq` wins.
    await outbox.enqueue(op({ id: "c", createdAt: 300 }));
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    const pending = await outbox.pending(1);

    expect(pending.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("breaks a createdAt tie by insertion order, not by id", async () => {
    await outbox.enqueue(op({ id: "b", createdAt: 100 }));
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));

    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("keeps insertion order for two ops queued in the same millisecond", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_123);
    await outbox.enqueue(op({ id: "second-tap", createdAt: Date.now() }));
    await outbox.enqueue(op({ id: "first-tap", createdAt: Date.now() }));
    now.mockRestore();

    const pending = await outbox.pending(1);

    expect(pending.map((entry) => entry.id)).toEqual(["second-tap", "first-tap"]);
    expect(pending.map((entry) => entry.createdAt)).toEqual([
      1_700_000_000_123, 1_700_000_000_123,
    ]);
    expect(pending.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it("stamps a monotonic seq per game, starting at 1", async () => {
    await outbox.enqueue(op({ id: "g1-a", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2-a", gameId: 2 }));
    await outbox.enqueue(op({ id: "g1-b", gameId: 1 }));

    expect((await outbox.pending(1)).map((entry) => entry.seq)).toEqual([1, 2]);
    expect((await outbox.pending(2)).map((entry) => entry.seq)).toEqual([1]);
  });

  it("round-trips the payload and the captured device id", async () => {
    await outbox.enqueue(
      op({
        id: "op-payload",
        kind: "delete",
        payload: { sequence: 3, event: [{ name: "Strafe", input: "Holding" }] },
        deviceId: "device-b",
        attempts: 2,
      }),
    );

    const [stored] = await outbox.pending(1);

    expect(stored).toMatchObject({
      id: "op-payload",
      gameId: 1,
      kind: "delete",
      payload: { sequence: 3, event: [{ name: "Strafe", input: "Holding" }] },
      deviceId: "device-b",
      attempts: 2,
      seq: 1,
    });
  });

  it("stores a missing device id as null", async () => {
    await outbox.enqueue(op({ id: "op-no-device", deviceId: undefined }));

    const [stored] = await outbox.pending(1);

    expect(stored?.deviceId).toBeNull();
  });

  it("rejects a duplicate id instead of overwriting the queued op", async () => {
    await outbox.enqueue(op({ id: "op-1", payload: { name: "Touchdown" } }));

    await expect(
      outbox.enqueue(op({ id: "op-1", payload: { name: "Safety (+2)" } })),
    ).rejects.toBeInstanceOf(DuplicateOpError);

    const pending = await outbox.pending(1);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload).toEqual({ name: "Touchdown" });
  });

  it("rejects a duplicate id across games too", async () => {
    await outbox.enqueue(op({ id: "op-1", gameId: 1 }));

    await expect(
      outbox.enqueue(op({ id: "op-1", gameId: 2 })),
    ).rejects.toBeInstanceOf(DuplicateOpError);

    expect(await outbox.pending(2)).toEqual([]);
  });

  it("scopes pending to one game and never interleaves two games", async () => {
    await outbox.enqueue(op({ id: "g1-a", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2-a", gameId: 2, createdAt: 110 }));
    await outbox.enqueue(op({ id: "g1-b", gameId: 1, createdAt: 120 }));
    await outbox.enqueue(op({ id: "g2-b", gameId: 2, createdAt: 130 }));

    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "g1-a",
      "g1-b",
    ]);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual([
      "g2-a",
      "g2-b",
    ]);
  });

  it("returns undefined from peek once the game is empty", async () => {
    expect(await outbox.peek(1)).toBeUndefined();

    await outbox.enqueue(op({ id: "b", createdAt: 200 }));
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));

    // Insertion order wins over `createdAt`: "b" was queued first.
    expect((await outbox.peek(1))?.id).toBe("b");
  });
});

describe("remove", () => {
  it("takes the op out of the queue and hands the next one to peek", async () => {
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await outbox.remove("a");

    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual(["b"]);
    expect((await outbox.peek(1))?.id).toBe("b");
  });

  it("ignores an id that is already gone", async () => {
    await expect(outbox.remove("nope")).resolves.toBeUndefined();
  });
});

describe("markFailed and retry", () => {
  it("moves the op out of the FIFO but keeps it with a reason", async () => {
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));

    await outbox.markFailed("a", "Ungültiger Eintrag.");

    expect(await outbox.pending(1)).toEqual([]);
    expect(await outbox.peek(1)).toBeUndefined();
    const failed = await outbox.failed(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      id: "a",
      failed: true,
      failedReason: "Ungültiger Eintrag.",
    });
    expect(failed[0]?.failedAt).toEqual(expect.any(Number));
  });

  it("does not block the ops behind a failed one", async () => {
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await outbox.markFailed("a", "HTTP 422");

    expect((await outbox.peek(1))?.id).toBe("b");
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("keeps the failure scoped to its game", async () => {
    await outbox.enqueue(op({ id: "g1", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2 }));

    await outbox.markFailed("g1", "HTTP 400");

    expect(await outbox.failed(1)).toHaveLength(1);
    expect(await outbox.failed(2)).toEqual([]);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual(["g2"]);
  });

  it("puts a retried op back at its original FIFO position", async () => {
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));
    await outbox.markFailed("a", "HTTP 422");

    await outbox.retry("a");

    expect(await outbox.failed(1)).toEqual([]);
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("counts one attempt per failure in the same write", async () => {
    await outbox.enqueue(op({ id: "a", attempts: 0 }));

    await outbox.markFailed("a", "HTTP 500");
    await outbox.markFailed("a", "HTTP 500");

    expect((await outbox.failed(1))[0]?.attempts).toBe(2);
    expect((await outbox.get("a"))?.attempts).toBe(2);
  });

  it("keeps the attempts an enqueuer stamped until a failure increments them", async () => {
    await outbox.enqueue(op({ id: "a", attempts: 3 }));

    expect((await outbox.peek(1))?.attempts).toBe(3);

    await outbox.markFailed("a", "HTTP 422");

    expect((await outbox.failed(1))[0]?.attempts).toBe(4);
  });

  it("ignores a failure or retry for an id that is gone", async () => {
    await expect(outbox.markFailed("nope", "HTTP 400")).resolves.toBeUndefined();
    await expect(outbox.retry("nope")).resolves.toBeUndefined();
  });
});

describe("get and gameIds", () => {
  it("returns a stored row by id, failed or pending", async () => {
    await outbox.enqueue(op({ id: "a" }));
    expect(await outbox.get("a")).toMatchObject({ id: "a", failed: false });

    await outbox.markFailed("a", "HTTP 422");
    expect(await outbox.get("a")).toMatchObject({ id: "a", failed: true });

    expect(await outbox.get("nope")).toBeUndefined();
  });

  it("lists every game with a row, pending or failed, once", async () => {
    await outbox.enqueue(op({ id: "g1-a", gameId: 1 }));
    await outbox.enqueue(op({ id: "g1-b", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2-a", gameId: 2 }));
    await outbox.markFailed("g1-a", "HTTP 422");

    expect((await outbox.gameIds()).sort()).toEqual([1, 2]);
    expect((await createOutbox().gameIds()).sort()).toEqual([1, 2]);
  });

  it("reports no games for an empty queue", async () => {
    expect(await outbox.gameIds()).toEqual([]);
  });
});

describe("clear", () => {
  it("drops pending and failed ops of one game and leaves the other alone", async () => {
    await outbox.enqueue(op({ id: "g1-a", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g1-b", gameId: 1, createdAt: 200 }));
    await outbox.enqueue(op({ id: "g2-a", gameId: 2 }));
    await outbox.markFailed("g1-a", "HTTP 422");

    await outbox.clear(1);

    expect(await outbox.pending(1)).toEqual([]);
    expect(await outbox.failed(1)).toEqual([]);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual(["g2-a"]);
  });

  it("accepts clearing a game that has no ops", async () => {
    await expect(outbox.clear(99)).resolves.toBeUndefined();
  });
});

describe("shared storage", () => {
  it("shows a second connection the ops the first one enqueued", async () => {
    const otherTab = createOutbox();

    await outbox.enqueue(op({ id: "from-tab-a", createdAt: 100 }));

    expect((await otherTab.pending(1)).map((entry) => entry.id)).toEqual([
      "from-tab-a",
    ]);

    await otherTab.enqueue(op({ id: "from-tab-b", createdAt: 200 }));
    await outbox.markFailed("from-tab-a", "HTTP 400");

    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "from-tab-b",
    ]);
    expect((await outbox.failed(1)).map((entry) => entry.id)).toEqual([
      "from-tab-a",
    ]);
  });

  it("keeps the queue across a reload (a new connection, same database)", async () => {
    await outbox.enqueue(op({ id: "survivor" }));

    expect(
      (await createOutbox().pending(1)).map((entry) => entry.id),
    ).toEqual(["survivor"]);
  });

  it("uses an injected database factory instead of the shared database", async () => {
    const injected = createOutbox(() =>
      openDB<OutboxSchema>("scorecard-v2-injected", DB_VERSION, {
        upgrade: upgradeOutbox,
      }),
    );

    await injected.enqueue(op({ id: "only-injected" }));

    expect((await injected.pending(1)).map((entry) => entry.id)).toEqual([
      "only-injected",
    ]);
    expect(await outbox.pending(1)).toEqual([]);
  });
});
