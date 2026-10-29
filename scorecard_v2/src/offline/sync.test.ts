// Installs the IndexedDB globals idb and the tests rely on (`IDBRequest`,
// `IDBKeyRange`, …). jsdom ships none of them.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { createOutbox, type Outbox } from "./outbox";
import {
  CHANNEL_NAME,
  DEVICE_LOCK_DETAIL,
  classify,
  createSync,
  isDeviceLockError,
  type Sync,
  type SyncState,
  type Transport,
} from "./sync";
import type { PendingOp as Op } from "./types";

function op(overrides: Partial<Op> = {}): Op {
  return {
    id: "op-1",
    gameId: 1,
    kind: "event",
    payload: { name: "Touchdown", half: 1 },
    createdAt: 1_000,
    attempts: 0,
    deviceId: "device-a",
    ...overrides,
  };
}

function deviceLock(): ApiError {
  return new ApiError(
    409,
    { detail: DEVICE_LOCK_DETAIL, device_id: "device-b" },
    DEVICE_LOCK_DETAIL,
  );
}

// Captured before any test installs fake timers: the helpers below need to let
// the real event loop (and therefore fake-indexeddb) make progress.
const realSetTimeout = globalThis.setTimeout;

async function settle(turns = 20): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise<void>((resolve) => {
      realSetTimeout(resolve, 0);
    });
  }
}

let outbox: Outbox;
let syncs: Sync[];

function start(
  transport: Transport,
  onChange: (state: SyncState) => void = () => undefined,
): Sync {
  const sync = createSync(outbox, transport, onChange);
  syncs.push(sync);
  return sync;
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  outbox = createOutbox();
  syncs = [];
});

afterEach(() => {
  for (const sync of syncs) {
    sync.dispose();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis.navigator, "locks");
});

describe("flush", () => {
  it("sends one game FIFO, removes each op and reports the queue after every op", async () => {
    const sent: string[] = [];
    const states: SyncState[] = [];
    const sync = start({ send: async (op_) => void sent.push(op_.id) }, (s) =>
      states.push(s),
    );
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await sync.flush(1);

    expect(sent).toEqual(["a", "b"]);
    expect(await outbox.pending(1)).toEqual([]);
    expect(states.map((state) => state.pending)).toEqual([2, 1, 0, 0]);
    expect(states[0]).toEqual({
      pending: 2,
      failed: 0,
      syncing: true,
      paused: null,
    });
    expect(states[states.length - 1]).toEqual({
      pending: 0,
      failed: 0,
      syncing: false,
      paused: null,
    });
  });

  it("removes a delivered op before the server answer is published", async () => {
    // Publishing inside `send` lets the screen adopt the server log while the
    // op is still queued, so the optimistic replay adds it a second time (a
    // doubled score for a frame). The answer may only be published after the
    // row is gone.
    const seen: number[] = [];
    const sync = start({
      send: async () => "server-log",
      landed: (sent) => {
        void outbox
          .pending(sent.gameId)
          .then((rows) => seen.push(rows.length), () => seen.push(-1));
      },
    });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);
    await settle(2);

    expect(seen).toEqual([0]);
  });

  it("does not touch another game's queue", async () => {
    const sent: string[] = [];
    const sync = start({ send: async (op_) => void sent.push(op_.id) });
    await outbox.enqueue(op({ id: "g1", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2 }));

    await sync.flush(1);

    expect(sent).toEqual(["g1"]);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual(["g2"]);
  });

  it("stops on a network failure and keeps the rest in order", async () => {
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.id === "b") {
        throw new ApiError(0, null, "Keine Verbindung zum Server.");
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));
    await outbox.enqueue(op({ id: "c", createdAt: 300 }));

    await sync.flush(1);

    expect(send.mock.calls.map(([sent]) => sent.id)).toEqual(["a", "b"]);
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "b",
      "c",
    ]);
    expect(await outbox.failed(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 2, failed: 0, paused: "offline" });
  });

  it.each([500, 503])("stops on %s without pausing the queue", async (status) => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(status, "<html>kaputt</html>");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
    expect(await outbox.failed(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 2, failed: 0, paused: null });
  });

  it.each([400, 422])(
    "marks a %s op failed and still sends the next one",
    async (status) => {
      const send = vi.fn<Transport["send"]>(async (sent: Op) => {
        if (sent.id === "a") {
          throw new ApiError(status, { detail: "Eintrag ungültig." }, "Eintrag ungültig.");
        }
      });
      const sync = start({ send });
      await outbox.enqueue(op({ id: "a", createdAt: 100 }));
      await outbox.enqueue(op({ id: "b", createdAt: 200 }));

      await sync.flush(1);

      expect(send.mock.calls.map(([sent]) => sent.id)).toEqual(["a", "b"]);
      expect(await outbox.pending(1)).toEqual([]);
      const failed = await outbox.failed(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        id: "a",
        failed: true,
        failedReason: "Eintrag ungültig.",
      });
      expect(sync.state()).toMatchObject({ pending: 0, failed: 1, paused: null });
    },
  );

  it("falls back to the error message, then the status, for a rejected op", async () => {
    const sync = start({
      send: async () => {
        throw new ApiError(404, undefined);
      },
    });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);

    expect((await outbox.failed(1))[0]?.failedReason).toBe(
      "Die Anfrage ist fehlgeschlagen.",
    );

    // A transport that throws a bare status object instead of an Error.
    const second = start({
      send: async () => {
        throw { status: 404 };
      },
    });
    await outbox.enqueue(op({ id: "b", gameId: 2 }));
    await second.flush(2);

    expect((await outbox.failed(2))[0]?.failedReason).toBe("HTTP 404");
  });

  it("treats a 404 on a delete as a successful replay", async () => {
    // Another tab (or an earlier attempt whose answer was lost) already deleted
    // the row; the server's 404 is the confirmation that there is nothing left.
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(
        404,
        { detail: "Could not delete team log 7 of game 1" },
        "Could not delete team log 7 of game 1",
      );
    });
    const sync = start({ send });
    await outbox.enqueue(
      op({ id: "undo-7", kind: "delete", payload: { team_log_id: 7 } }),
    );

    await sync.flush(1);

    expect(await outbox.pending(1)).toEqual([]);
    expect(await outbox.failed(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 0, failed: 0, paused: null });
  });

  it("sends a possession op and clears it from the queue", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(
      op({ id: "pat", kind: "possession", payload: { team: "home" } }),
    );

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      id: "pat",
      kind: "possession",
    });
    expect(await outbox.pending(1)).toEqual([]);
    expect(await outbox.failed(1)).toEqual([]);
  });

  it("still rejects a 404 for a possession, which only deletes replay", async () => {
    const sync = start({
      send: async () => {
        throw new ApiError(404, { detail: "Spielzug nicht gefunden." });
      },
    });
    await outbox.enqueue(op({ id: "pat", kind: "possession" }));

    await sync.flush(1);

    expect(await outbox.pending(1)).toEqual([]);
    expect((await outbox.failed(1)).map((entry) => entry.id)).toEqual(["pat"]);
  });

  it("flattens a DRF field error into the failed reason", async () => {
    const sync = start({
      send: async () => {
        throw new ApiError(400, { team_log_id: ["must be an integer"] });
      },
    });
    await outbox.enqueue(op({ id: "a", kind: "delete" }));

    await sync.flush(1);

    expect((await outbox.failed(1))[0]?.failedReason).toBe(
      "must be an integer",
    );
  });

  it("counts the failed attempts on the stored op", async () => {
    const sync = start({
      send: async () => {
        throw new ApiError(422, { detail: "Eintrag ungültig." });
      },
    });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect((await outbox.failed(1))[0]?.attempts).toBe(1);
  });

  it("treats a duplicate client_id answered with 200 as delivered", async () => {
    // The first attempt reached the server but the answer was lost; the replay
    // is answered with the current log and a 200, which the transport resolves.
    let attempts = 0;
    const send = vi.fn<Transport["send"]>(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ApiError(0, null, "Keine Verbindung zum Server.");
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "client-id-1" }));

    await sync.flush(1);
    expect(await outbox.pending(1)).toHaveLength(1);

    await sync.resume();

    expect(await outbox.pending(1)).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([sent]) => sent.id)).toEqual([
      "client-id-1",
      "client-id-1",
    ]);
  });

  it("never sends twice when flush is called twice concurrently", async () => {
    const resolvers: Array<() => void> = [];
    const send = vi.fn<Transport["send"]>(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(() => {
            resolve();
          });
        }),
    );
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    const first = sync.flush(1);
    const second = sync.flush(1);
    await settle(4);
    expect(send).toHaveBeenCalledTimes(1);

    resolvers.shift()?.();
    await settle();
    resolvers.shift()?.();
    await settle();
    await Promise.all([first, second]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(await outbox.pending(1)).toEqual([]);
  });

  it("stays syncing until the last of two concurrent games finishes", async () => {
    const resolvers = new Map<number, () => void>();
    const send = vi.fn<Transport["send"]>(
      (sent) =>
        new Promise<void>((resolve) => {
          resolvers.set(sent.gameId, resolve);
        }),
    );
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2, createdAt: 200 }));

    const first = sync.flush(1);
    const second = sync.flush(2);
    await settle(4);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sync.state().syncing).toBe(true);

    resolvers.get(1)?.();
    await settle();
    // One game is still in flight: the state must not claim to be done.
    expect(sync.state().syncing).toBe(true);

    resolvers.get(2)?.();
    await settle();
    await Promise.all([first, second]);

    expect(sync.state().syncing).toBe(false);
  });

  it("leaves the queue alone when the transport is empty", async () => {
    const sync = start({ send: async () => undefined });

    await expect(sync.flush(1)).resolves.toBeUndefined();

    expect(await outbox.pending(1)).toEqual([]);
  });
});

describe("pauses", () => {
  it.each([401, 403])(
    "pauses on %s without failing anything, and resumes after a re-login",
    async (status) => {
      const send = vi.fn<Transport["send"]>(async () => {
        throw new ApiError(status, { detail: "Anmeldung abgelaufen." }, "Anmeldung abgelaufen.");
      });
      const sync = start({ send });
      await outbox.enqueue(op({ id: "a", createdAt: 100 }));
      await outbox.enqueue(op({ id: "b", createdAt: 200 }));

      await sync.flush(1);

      expect(send).toHaveBeenCalledTimes(1);
      expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
        "a",
        "b",
      ]);
      expect(await outbox.failed(1)).toEqual([]);
      expect(sync.state()).toMatchObject({ pending: 2, failed: 0, paused: "auth" });

      // A paused queue must not be drained, however often it is asked.
      await sync.flush(1);
      expect(send).toHaveBeenCalledTimes(1);

      send.mockImplementation(async () => undefined);
      await sync.resume();

      expect(await outbox.pending(1)).toEqual([]);
      expect(sync.state()).toMatchObject({ pending: 0, paused: null });
    },
  );

  it("fails a 403 whose detail is about this op, and keeps draining", async () => {
    // The per-row permission check (`_can_delete_team_log`) answers 403 with an
    // actionable detail. That op can never succeed, so it must not pause the
    // queue of the whole game — it belongs in `failed`, with retry/drop.
    const reason = "You do not have permission to delete this game log entry.";
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.id === "undo") {
        throw new ApiError(403, { detail: reason }, reason);
      }
    });
    const sync = start({ send });
    await outbox.enqueue(
      op({ id: "undo", kind: "delete", payload: { team_log_id: 9 } }),
    );
    await outbox.enqueue(op({ id: "next", createdAt: 200 }));

    await sync.flush(1);

    expect(send.mock.calls.map(([sent]) => sent.id)).toEqual(["undo", "next"]);
    expect(await outbox.pending(1)).toEqual([]);
    expect((await outbox.failed(1)).map((entry) => entry.id)).toEqual(["undo"]);
    expect((await outbox.failed(1))[0]?.failedReason).toBe(reason);
    expect(sync.state()).toMatchObject({ pending: 0, failed: 1, paused: null });
  });

  it("pauses on a 403 without a detail, the old expired-session answer", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(403, undefined);
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.failed(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 2, failed: 0, paused: "auth" });
  });

  it("pauses on a 403 that names the session or CSRF", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(
        403,
        "CSRF verification failed. Request aborted.",
        "CSRF verification failed. Request aborted.",
      );
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(await outbox.failed(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 1, failed: 0, paused: "auth" });
  });

  it("pauses on the device lock and keeps every op", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw deviceLock();
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
    expect(await outbox.failed(1)).toEqual([]);
    // The lock belongs to this game only (see `pausedFor`).
    expect(sync.stateFor(1)).toMatchObject({
      pending: 2,
      failed: 0,
      paused: "device",
    });
  });

  it("pauses only the game the other device holds", async () => {
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.gameId === 1) {
        throw deviceLock();
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2, createdAt: 200 }));

    await sync.flush(1);

    expect(sync.pausedFor(1)).toBe("device");
    expect(sync.pausedFor(2)).toBeNull();
    expect(sync.stateFor(1).paused).toBe("device");
    expect(sync.stateFor(2).paused).toBeNull();

    // Game 2 has nothing to do with the conflict and still drains.
    await sync.flush(2);

    expect(await outbox.pending(2)).toEqual([]);
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual(["g1"]);
  });

  it("keeps the session pause app-wide", async () => {
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.gameId === 1) {
        throw new ApiError(401, { detail: "Anmeldung abgelaufen." });
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2, createdAt: 200 }));

    await sync.flush(1);

    expect(sync.pausedFor(1)).toBe("auth");
    expect(sync.pausedFor(2)).toBe("auth");
    await sync.flush(2);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual(["g2"]);
  });

  it("detects the device lock from the device_id in the body", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(409, { device_id: "device-b" });
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(sync.pausedFor(1)).toBe("device");
    expect(await outbox.pending(1)).toHaveLength(1);
  });

  it("detects the device lock from the detail text when the body has no device_id", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(409, { detail: `Hinweis: ${DEVICE_LOCK_DETAIL}` });
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(sync.pausedFor(1)).toBe("device");
    expect(await outbox.pending(1)).toHaveLength(1);
  });

  it("treats a 409 without the device lock as a rejected op", async () => {
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.id === "a") {
        throw new ApiError(
          409,
          { detail: "Das Spiel ist bereits beendet." },
          "Das Spiel ist bereits beendet.",
        );
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await sync.flush(1);

    expect(await outbox.pending(1)).toEqual([]);
    expect((await outbox.failed(1)).map((entry) => entry.id)).toEqual(["a"]);
    expect(sync.state()).toMatchObject({ failed: 1, paused: null });
  });

  it("pauses on demand and resumes with a drain", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    sync.pause("device");
    expect(sync.state().paused).toBe("device");
    await sync.flush(1);
    expect(send).not.toHaveBeenCalled();

    await sync.resume();

    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.pending(1)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 0, paused: null });
  });

  it("pauses offline by default and still reports the blocked queue", async () => {
    const states: SyncState[] = [];
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send }, (state) => states.push(state));
    await outbox.enqueue(op({ id: "a" }));

    sync.pause();
    expect(sync.state().paused).toBe("offline");

    await sync.flush(1);

    expect(send).not.toHaveBeenCalled();
    expect(states[states.length - 1]).toMatchObject({
      pending: 1,
      syncing: false,
      paused: "offline",
    });
  });
});

describe("retries", () => {
  it("backs off 1 s, 2 s, 4 s … capped at 30 s and never spins", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(0, null, "Keine Verbindung zum Server.");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    const steps: Array<[number, number]> = [
      [1_000, 2],
      [2_000, 3],
      [4_000, 4],
      [8_000, 5],
      [16_000, 6],
      [30_000, 7],
      [30_000, 8],
    ];
    for (const [delay, expected] of steps) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
      expect(send).toHaveBeenCalledTimes(expected);
    }

    // At the cap: no attempt before the full 30 s have passed.
    await vi.advanceTimersByTimeAsync(29_999);
    await settle();
    expect(send).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(9);
    expect(await outbox.pending(1)).toHaveLength(1);
  });

  it("keeps a failed game's retry armed while another game flushes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async (sent: Op) => {
      if (sent.gameId === 1) {
        throw new ApiError(503, "<html>kaputt</html>");
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2, createdAt: 200 }));

    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);
    // A successful flush of game 2 must not clear game 1's timer.
    await sync.flush(2);
    expect(await outbox.pending(2)).toEqual([]);

    await vi.advanceTimersByTimeAsync(999);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.filter(([sent]) => sent.gameId === 1)).toHaveLength(2);
    expect(send.mock.calls.filter(([sent]) => sent.gameId === 2)).toHaveLength(1);
  });

  it("honours Retry-After on a 429 instead of the exponential step", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let attempts = 0;
    const send = vi.fn<Transport["send"]>(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new ApiError(429, null, "Zu viele Anfragen."), {
          retryAfterMs: 5_000,
        });
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    // The first backoff step would be 1 s; the server asked for 5 s.
    await vi.advanceTimersByTimeAsync(4_999);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("caps a long Retry-After at 30 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let attempts = 0;
    const send = vi.fn<Transport["send"]>(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new ApiError(429, null, "Zu viele Anfragen."), {
          headers: { "Retry-After": "120" },
        });
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);
    await vi.advanceTimersByTimeAsync(29_999);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps the queue when the browser goes offline", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    globalThis.dispatchEvent(new Event("offline"));
    await settle(2);

    expect(sync.state().paused).toBe("offline");
    expect((await outbox.pending(1)).map((entry) => entry.id)).toEqual(["a"]);
    expect(send).not.toHaveBeenCalled();
  });

  it("retries every known game when the browser comes back online", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(0, null, "Keine Verbindung zum Server.");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2 }));

    // The failed flush pauses the queue; the second call only registers game 2.
    await sync.flush(1);
    await sync.flush(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sync.state().paused).toBe("offline");

    send.mockImplementation(async () => undefined);
    globalThis.dispatchEvent(new Event("online"));
    await settle();

    expect(await outbox.pending(1)).toEqual([]);
    expect(await outbox.pending(2)).toEqual([]);
    expect(sync.state()).toMatchObject({ pending: 0, paused: null });
  });

  it("retries when the tab becomes visible again", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(0, null, "Keine Verbindung zum Server.");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(sync.state().paused).toBe("offline");

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await settle(2);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(2);
    expect(send).toHaveBeenCalledTimes(1);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    send.mockImplementation(async () => undefined);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();

    expect(await outbox.pending(1)).toEqual([]);
  });

  it("stops retrying after dispose", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(0, null, "Keine Verbindung zum Server.");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    sync.dispose();
    syncs = [];

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.pending(1)).toHaveLength(1);
  });
});

describe("counts", () => {
  it("reports pending and failed per game", async () => {
    const sync = start({ send: async () => undefined });
    await outbox.enqueue(op({ id: "a", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", gameId: 1, createdAt: 200 }));
    await outbox.enqueue(op({ id: "c", gameId: 2 }));
    await outbox.markFailed("b", "HTTP 422");

    await expect(sync.counts(1)).resolves.toEqual({ pending: 1, failed: 1 });
    await expect(sync.counts(2)).resolves.toEqual({ pending: 1, failed: 0 });
  });
});

describe("creation", () => {
  it("knows the games a reload left in the store", async () => {
    await outbox.enqueue(op({ id: "g1", gameId: 1 }));
    await outbox.enqueue(op({ id: "g1-b", gameId: 1 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2 }));
    await outbox.markFailed("g2", "HTTP 422");

    const sync = start({ send: async () => undefined });
    await settle(4);

    expect(sync.state()).toMatchObject({ pending: 2, failed: 1 });
  });

  it("starts with empty counts when the store is empty", async () => {
    const sync = start({ send: async () => undefined });
    await settle(4);

    expect(sync.state()).toMatchObject({ pending: 0, failed: 0 });
  });
});

describe("cross-tab", () => {
  class FakeChannel {
    static all: FakeChannel[] = [];
    static sent: unknown[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      FakeChannel.all.push(this);
    }

    postMessage(data: unknown): void {
      FakeChannel.sent.push(data);
      for (const peer of FakeChannel.all) {
        if (peer !== this && peer.name === this.name) {
          peer.onmessage?.({ data } as MessageEvent);
        }
      }
    }

    close(): void {
      FakeChannel.all = FakeChannel.all.filter((peer) => peer !== this);
    }
  }

  beforeEach(() => {
    FakeChannel.all = [];
    FakeChannel.sent = [];
    vi.stubGlobal("BroadcastChannel", FakeChannel);
  });

  it("lets the second tab see the queue drain in the first one", async () => {
    const states: SyncState[] = [];
    const reader = start({ send: async () => undefined }, (state) =>
      states.push(state),
    );
    // Read-only in the second tab, so it observes instead of draining.
    reader.pause("device");
    await outbox.enqueue(op({ id: "a", createdAt: 100 }));
    await outbox.enqueue(op({ id: "b", createdAt: 200 }));

    await reader.flush(1);
    expect(states[states.length - 1]).toMatchObject({ pending: 2, failed: 0 });

    const writer = start({ send: async () => undefined });
    await writer.flush(1);
    await settle(2);

    expect(await outbox.pending(1)).toEqual([]);
    expect(states[states.length - 1]).toMatchObject({
      pending: 0,
      failed: 0,
      paused: "device",
    });
  });

  it("hands a device-lock pause to the other tab", async () => {
    const other = start({ send: async () => undefined });
    await outbox.enqueue(op({ id: "a" }));

    const first = start({
      send: async () => {
        throw deviceLock();
      },
    });
    await first.flush(1);
    await settle(2);

    expect(other.pausedFor(1)).toBe("device");
    expect(await outbox.pending(1)).toHaveLength(1);
  });

  it("lifts the pause in the other tab when one tab resumes", async () => {
    const first = start({ send: async () => undefined });
    const other = start({ send: async () => undefined });

    first.pause("auth");
    await settle(2);
    expect(other.state().paused).toBe("auth");

    await first.resume();
    await settle(2);

    expect(other.state().paused).toBeNull();
  });

  it("keeps a manual pause through another tab's visibility retry", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const first = start({ send });
    const other = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    first.pause("offline");
    await settle(2);
    expect(other.state().paused).toBe("offline");

    // The second tab was throttled and comes back: its own retry must not lift
    // a pause the user asked for, nor broadcast `resumed` to the first tab.
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(2);

    expect(other.state().paused).toBe("offline");
    expect(first.state().paused).toBe("offline");
    expect(send).not.toHaveBeenCalled();

    // An explicit resume is what clears a manual pause — in both tabs.
    await first.resume();
    await settle(2);

    expect(first.state().paused).toBeNull();
    expect(other.state().paused).toBeNull();
  });

  it("broadcasts a delete replay the server answered with 404", async () => {
    const sync = start({
      send: async () => {
        throw new ApiError(404, { detail: "schon weg" });
      },
    });
    await outbox.enqueue(op({ id: "undo", kind: "delete" }));

    await sync.flush(1);

    expect(FakeChannel.sent).toContainEqual({ type: "changed", gameId: 1 });
  });

  it("ignores foreign messages and a closed channel", async () => {
    const states: SyncState[] = [];
    const sync = start({ send: async () => undefined }, (state) =>
      states.push(state),
    );

    const [peer] = FakeChannel.all;
    peer?.onmessage?.({ data: "kaputt" } as MessageEvent);
    peer?.onmessage?.({ data: { type: "changed", gameId: "1" } } as MessageEvent);
    await settle(2);
    expect(states).toEqual([]);

    sync.dispose();
    syncs = [];
    expect(() => {
      peer?.onmessage?.({ data: { type: "changed", gameId: 1 } } as MessageEvent);
    }).not.toThrow();
    expect(FakeChannel.all).toEqual([]);
  });

  it("keeps a manual device pause another tab announced", async () => {
    const sync = start({ send: async () => undefined });
    const [peer] = FakeChannel.all;

    peer?.onmessage?.({
      data: { type: "paused", reason: "device", gameId: 1, manual: true },
    } as MessageEvent);
    await settle(2);

    expect(sync.pausedFor(1)).toBe("device");
    // The manual flag survives, so this tab's visibility retry cannot lift it.
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settle(2);
    expect(sync.pausedFor(1)).toBe("device");
  });

  it("keeps a manual app-wide pause another tab announced", async () => {
    const sync = start({ send: async () => undefined });
    const [peer] = FakeChannel.all;

    peer?.onmessage?.({
      data: { type: "paused", reason: "auth", manual: true },
    } as MessageEvent);
    await settle(2);

    expect(sync.state().paused).toBe("auth");
  });

  it("lifts one game's device pause when another tab resumes that game", async () => {
    const first = start({ send: async () => undefined });
    const other = start({ send: async () => undefined });
    const [, otherPeer] = FakeChannel.all;

    first.pause("device", 1);
    await settle(2);
    expect(other.pausedFor(1)).toBe("device");

    // The staff unlock happened in the first tab.
    otherPeer?.onmessage?.({ data: { type: "resumed", gameId: 1 } } as MessageEvent);
    await settle(2);

    expect(other.pausedFor(1)).toBeNull();
  });

  it(`uses the "${CHANNEL_NAME}" channel name`, () => {
    start({ send: async () => undefined });

    expect(FakeChannel.all.map((channel) => channel.name)).toEqual([
      CHANNEL_NAME,
    ]);
  });
});

describe("navigator.locks", () => {
  function fakeLocks(): {
    held: Set<string>;
    request: (
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: { name: string } | null) => Promise<unknown>,
    ) => Promise<unknown>;
    names: string[];
  } {
    const held = new Set<string>();
    const names: string[] = [];
    return {
      held,
      names,
      async request(name, _options, callback) {
        names.push(name);
        if (held.has(name)) {
          return callback(null);
        }
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    };
  }

  it("keeps one drainer when a second tab asks for the same game", async () => {
    const locks = fakeLocks();
    Object.defineProperty(globalThis.navigator, "locks", {
      value: locks,
      configurable: true,
    });
    const hang = vi.fn(
      () =>
        new Promise<void>(() => {
          // The first tab keeps the lock for the whole test.
        }),
    );
    const other = vi.fn(async () => undefined);
    const first = start({ send: hang });
    const second = start({ send: other });
    await outbox.enqueue(op({ id: "a" }));

    void first.flush(1);
    await settle(4);
    expect(hang).toHaveBeenCalledTimes(1);
    expect(locks.held.has("outbox-1")).toBe(true);

    await second.flush(1);

    expect(other).not.toHaveBeenCalled();
    expect(locks.names).toEqual(["outbox-1", "outbox-1"]);
  });

  it("still drains when the lock manager is unavailable", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps one drainer across two engines in the same tab without a lock manager", async () => {
    const resolvers: Array<() => void> = [];
    const send = vi.fn<Transport["send"]>(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const first = start({ send });
    const second = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    void first.flush(1);
    await settle(4);
    expect(send).toHaveBeenCalledTimes(1);

    const secondFlush = second.flush(1);
    await settle(2);

    expect(send).toHaveBeenCalledTimes(1);

    resolvers.shift()?.();
    await settle();
    await secondFlush;

    expect(await outbox.pending(1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The classification and pause details the happy paths never reach.
// ---------------------------------------------------------------------------

describe("classify", () => {
  it("treats a missing, non-numeric or non-finite status as 'not delivered'", () => {
    expect(classify("kaputt")).toEqual({
      kind: "transient",
      reason: "offline",
    });
    expect(classify({})).toEqual({ kind: "transient", reason: "offline" });
    expect(classify({ status: "500" })).toEqual({
      kind: "transient",
      reason: "offline",
    });
    expect(classify({ status: Number.NaN })).toEqual({
      kind: "transient",
      reason: "offline",
    });
    expect(classify(null)).toEqual({ kind: "transient", reason: "offline" });
  });

  it("retries 5xx and 408 as a server problem", () => {
    expect(classify({ status: 500 })).toEqual({
      kind: "transient",
      reason: "server",
    });
    expect(classify({ status: 408 })).toEqual({
      kind: "transient",
      reason: "server",
    });
  });

  it("classifies 401 as the session and a per-row 403 as a rejection", () => {
    expect(classify({ status: 401 })).toEqual({ kind: "auth" });
    expect(
      classify({ status: 403, detail: "Nicht dein Eintrag." }),
    ).toEqual({ kind: "rejected", reason: "Nicht dein Eintrag." });
  });

  it("treats a 403 whose detail is not text as a session problem", () => {
    expect(classify({ status: 403, body: { detail: 42 } })).toEqual({
      kind: "auth",
    });
    // A DRF field error names no session, so it is a rejection.
    expect(
      classify({ status: 403, body: { event: ["Unbekanntes Ereignis."] } }),
    ).toEqual({ kind: "rejected", reason: "Unbekanntes Ereignis." });
  });

  it("falls back to the status when a 403 carries no detail", () => {
    // `detailOf` is null only when the body has nothing readable, which
    // `isSessionError` treats as the old expired-session answer; the explicit
    // status text is only the last resort for a rejection.
    expect(classify({ status: 403, body: [] })).toEqual({ kind: "auth" });
    expect(classify({ status: 418 })).toEqual({
      kind: "rejected",
      reason: "HTTP 418",
    });
  });

  it("falls back to the message and then the status for a rejection", () => {
    expect(classify({ status: 422, message: "Feld fehlt." })).toEqual({
      kind: "rejected",
      reason: "Feld fehlt.",
    });
    expect(classify({ status: 422, body: { event: ["Feld fehlt."] } })).toEqual(
      { kind: "rejected", reason: "Feld fehlt." },
    );
    expect(classify({ status: 422 })).toEqual({
      kind: "rejected",
      reason: "HTTP 422",
    });
  });

  it("clips a long rejection reason to one line", () => {
    const long = "x".repeat(400);
    const verdict = classify({ status: 400, detail: long });

    expect(verdict).toMatchObject({ kind: "rejected" });
    if (verdict.kind === "rejected") {
      expect(verdict.reason).toHaveLength(200);
      expect(verdict.reason.endsWith("…")).toBe(true);
    }
  });

  it("reads a 429 Retry-After as milliseconds, seconds or a date", () => {
    expect(
      classify({ status: 429, retryAfterMs: 5_000 }),
    ).toMatchObject({ kind: "transient", retryAfterMs: 5_000 });
    expect(classify({ status: 429, retryAfter: 3 })).toMatchObject({
      retryAfterMs: 3_000,
    });
    expect(classify({ status: 429, retryAfter: "7" })).toMatchObject({
      retryAfterMs: 7_000,
    });
    expect(classify({ status: 429, retryAfter: -5 })).toMatchObject({
      retryAfterMs: 0,
    });
    const date = new Date(Date.now() + 10_000).toUTCString();
    const fromDate = classify({ status: 429, retryAfter: date });
    expect(fromDate).toMatchObject({ kind: "transient" });
    if (fromDate.kind === "transient") {
      expect(fromDate.retryAfterMs).toBeGreaterThan(0);
      expect(fromDate.retryAfterMs).toBeLessThanOrEqual(10_000);
    }
  });

  it("falls back to the exponential step for an unreadable Retry-After", () => {
    expect(classify({ status: 429, retryAfter: "" })).toEqual({
      kind: "transient",
      reason: "server",
      retryAfterMs: undefined,
    });
    expect(classify({ status: 429, retryAfter: "irgendwann" })).toMatchObject({
      retryAfterMs: undefined,
    });
    expect(classify({ status: 429 })).toMatchObject({
      retryAfterMs: undefined,
    });
    expect(classify({ status: 429, retryAfterMs: Number.NaN })).toMatchObject({
      retryAfterMs: undefined,
    });
  });

  it("reads Retry-After from a Headers-like getter and from a plain object", () => {
    const headers = {
      get: (name: string) => (name === "retry-after" ? "4" : null),
    };
    expect(classify({ status: 429, headers })).toMatchObject({
      retryAfterMs: 4_000,
    });
    expect(
      classify({ status: 429, headers: { "Retry-After": "5" } }),
    ).toMatchObject({ retryAfterMs: 5_000 });
    expect(classify({ status: 429, headers: { other: "5" } })).toMatchObject({
      retryAfterMs: undefined,
    });
    expect(classify({ status: 429, headers: "keine" })).toMatchObject({
      retryAfterMs: undefined,
    });
  });

  it("ignores a getter that throws", () => {
    const headers = {
      get: () => {
        throw new Error("kaputt");
      },
    };
    expect(classify({ status: 429, headers })).toMatchObject({
      retryAfterMs: undefined,
    });
  });
});

describe("isDeviceLockError", () => {
  it("detects the lock in the body, the detail and the message", () => {
    expect(isDeviceLockError({ body: { device_id: "device-b" } })).toBe(true);
    expect(
      isDeviceLockError({ body: { detail: DEVICE_LOCK_DETAIL } }),
    ).toBe(true);
    expect(isDeviceLockError({ detail: DEVICE_LOCK_DETAIL })).toBe(true);
    expect(isDeviceLockError({ message: DEVICE_LOCK_DETAIL })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDeviceLockError({ body: null })).toBe(false);
    expect(isDeviceLockError({ body: { detail: "Etwas anderes." } })).toBe(
      false,
    );
    expect(isDeviceLockError("kaputt")).toBe(false);
    expect(isDeviceLockError({})).toBe(false);
  });
});

describe("pause and resume details", () => {
  it("does not announce a pause that is already set", async () => {
    const states: SyncState[] = [];
    const sync = start({ send: async () => undefined }, (state) =>
      states.push(state),
    );

    sync.pause("auth");
    await settle(2);
    const announced = states.length;
    sync.pause("auth");
    await settle(2);

    expect(states.length).toBe(announced);
  });

  it("an unscoped device pause blocks every game", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    sync.pause("device");

    expect(sync.pausedFor(1)).toBe("device");
    expect(sync.pausedFor(2)).toBe("device");
    await sync.flush(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("resume(gameId) lifts only one game's device pause", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "g1", gameId: 1, createdAt: 100 }));
    await outbox.enqueue(op({ id: "g2", gameId: 2, createdAt: 200 }));

    sync.pause("device", 1);
    sync.pause("device", 2);
    expect(sync.stateFor(1).paused).toBe("device");

    await sync.resume(1);

    expect(sync.pausedFor(1)).toBeNull();
    expect(sync.pausedFor(2)).toBe("device");
    expect(await outbox.pending(1)).toEqual([]);
    expect((await outbox.pending(2)).map((entry) => entry.id)).toEqual(["g2"]);
  });

  it("resume(gameId) also lifts an app-wide pause", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    sync.pause("auth");

    await sync.resume(1);

    expect(sync.state().paused).toBeNull();
    expect(await outbox.pending(1)).toEqual([]);
  });

  it("keeps an auth pause when the browser goes offline", async () => {
    const sync = start({ send: async () => undefined });
    sync.pause("auth");
    await settle(2);

    globalThis.dispatchEvent(new Event("offline"));
    await settle(2);

    expect(sync.state().paused).toBe("auth");
  });

  it("reports the op that is being sent right now", async () => {
    const resolvers: Array<() => void> = [];
    const send = vi.fn<Transport["send"]>(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const sync = start({ send });
    await outbox.enqueue(op({ id: "inflight" }));

    const flushing = sync.flush(1);
    await settle(4);
    expect(sync.sendingOp(1)).toBe("inflight");
    expect(sync.sendingOp(2)).toBeNull();

    resolvers.shift()?.();
    await settle();
    await flushing;
    expect(sync.sendingOp(1)).toBeNull();
  });
});

describe("broken stores and subscribers", () => {
  function brokenOutbox(overrides: Partial<Outbox> = {}): Outbox {
    return {
      enqueue: async () => undefined,
      pending: async () => [],
      peek: async () => undefined,
      get: async () => undefined,
      gameIds: async () => [],
      remove: async () => undefined,
      markFailed: async () => undefined,
      failed: async () => [],
      retry: async () => undefined,
      clear: async () => undefined,
      clearAll: async () => undefined,
      ...overrides,
    };
  }

  it("keeps the last counts when a store read fails while emitting", async () => {
    const sync = createSync(
      brokenOutbox({
        pending: async () => {
          throw new Error("IndexedDB weg");
        },
      }),
      { send: async () => undefined },
      () => undefined,
    );
    syncs.push(sync);

    // `flush` registers the game, then `emit` fails to count it.
    await sync.flush(7);

    expect(sync.state()).toMatchObject({ pending: 0, failed: 0, syncing: false });
  });

  it("survives a subscriber that throws", async () => {
    const sync = createSync(
      outbox,
      { send: async () => undefined },
      () => {
        throw new Error("kaputt");
      },
    );
    syncs.push(sync);
    await outbox.enqueue(op({ id: "a" }));

    await expect(sync.flush(1)).resolves.toBeUndefined();

    expect(await outbox.pending(1)).toEqual([]);
  });

  it("drains the games it knows when the store cannot list them", async () => {
    let known = false;
    let drained = false;
    const store = brokenOutbox({
      gameIds: async () => {
        if (!known) {
          known = true;
          throw new Error("IndexedDB weg");
        }
        return [];
      },
      pending: async (gameId) =>
        gameId === 1 && !drained ? [{ ...op({ id: "a" }), seq: 1 } as never] : [],
      peek: async (gameId) => {
        if (gameId !== 1 || drained) {
          return undefined;
        }
        drained = true;
        return { ...op({ id: "a" }), seq: 1 } as never;
      },
    });
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = createSync(store, { send }, () => undefined);
    syncs.push(sync);

    // The first flush registers game 1; the boot read then fails and
    // `flushAll` still drains what this engine knows.
    await sync.flush(1);
    await sync.flushAll();

    expect(send).toHaveBeenCalled();
  });

  it("closes quietly when the lock manager itself throws", async () => {
    let acquired = false;
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: unknown,
          callback: (lock: { name: string } | null) => Promise<unknown>,
        ) => {
          // The callback ran (the lock was acquired), then the wrapper broke:
          // replaying the drain would double-send.
          acquired = true;
          await callback({ name: "outbox-1" });
          throw new Error("Lock kaputt");
        },
      },
    });
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(acquired).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.pending(1)).toEqual([]);
  });

  it("replays the drain when the lock could not be acquired at all", async () => {
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: async () => {
          throw new Error("Lock kaputt");
        },
      },
    });
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await outbox.pending(1)).toEqual([]);
  });

  it("does nothing when a flush arrives after dispose", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    sync.dispose();
    syncs = [];

    await sync.flush(1);

    expect(send).not.toHaveBeenCalled();
  });

  it("creates and disposes without globals it does not need", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("addEventListener", undefined);
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = createSync(outbox, { send }, () => undefined);

    expect(() => sync.dispose()).not.toThrow();
  });

  it("keeps sending when a cross-tab broadcast fails", async () => {
    class ThrowingChannel {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(): void {
        throw new Error("Kanal kaputt");
      }
      close(): void {
        throw new Error("schon zu");
      }
    }
    vi.stubGlobal("BroadcastChannel", ThrowingChannel);
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await expect(sync.flush(1)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(() => sync.dispose()).not.toThrow();
    syncs = [];
  });
});

describe("retry timers", () => {
  it("clears an offline pause it set itself when the timer fires", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let attempts = 0;
    const send = vi.fn<Transport["send"]>(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ApiError(0, null, "Keine Verbindung.");
      }
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(sync.state().paused).toBe("offline");

    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(sync.state().paused).toBeNull();
    expect(await outbox.pending(1)).toEqual([]);
  });

  it("does not retry while a manual pause is in force", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(503, null, "Wartung");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    sync.pause("auth");
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(sync.state().paused).toBe("auth");
  });

  it("a resume clears a pending backoff and tries at once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(503, null, "Wartung");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockImplementation(async () => undefined);
    await sync.resume();

    expect(await outbox.pending(1)).toEqual([]);
    // The timer was dropped, so advancing time must not send a second time.
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps the queue when a delete is rejected for another reason", async () => {
    const reason = "Eintrag gehört zu einem anderen Team.";
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(403, { detail: reason }, reason);
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "undo", kind: "delete", payload: {} }));

    await sync.flush(1);

    expect((await outbox.failed(1))[0]?.failedReason).toBe(reason);
  });
});

describe("more defensive branches", () => {
  it("flattens a deeply nested field error", () => {
    expect(
      classify({
        status: 400,
        body: { a: { b: { c: { d: ["Zu tief."] } } } },
      }),
    ).toEqual({ kind: "rejected", reason: "HTTP 400" });
    expect(classify({ status: 400, body: { a: ["", "  ", "Gut."] } })).toEqual(
      { kind: "rejected", reason: "Gut." },
    );
  });

  it("still syncs when BroadcastChannel cannot be constructed", async () => {
    class BrokenChannel {
      constructor() {
        throw new Error("kein Kanal");
      }
    }
    vi.stubGlobal("BroadcastChannel", BrokenChannel);
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(await outbox.pending(1)).toEqual([]);
  });

  it("stays quiet when paused after dispose", async () => {
    const onState = vi.fn();
    const sync = start({ send: async () => undefined }, onState);
    sync.dispose();
    syncs = [];
    onState.mockClear();

    sync.pause("auth");

    expect(onState).not.toHaveBeenCalled();
  });

  it("stops before the loop when it was disposed under the lock", async () => {
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: unknown,
          callback: (lock: { name: string } | null) => Promise<unknown>,
        ) => {
          sync.dispose();
          return callback({ name: "outbox-1" });
        },
      },
    });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(send).not.toHaveBeenCalled();
  });

  it("drains at once after a manual pause is lifted with a dead timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(503, null, "Wartung");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    sync.pause("auth");
    // The backoff fires while the app pause is in force: its timer is gone but
    // the step stays.
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    send.mockImplementation(async () => undefined);
    await sync.resume();

    expect(await outbox.pending(1)).toEqual([]);
  });
});

describe("queued browser events", () => {
  it("ignores an online event delivered after dispose", async () => {
    const online = new Set<EventListener>();
    const offline = new Set<EventListener>();
    const realAdd = globalThis.addEventListener.bind(globalThis);
    vi.spyOn(globalThis, "addEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        const fn = listener as EventListener;
        if (type === "online") online.add(fn);
        if (type === "offline") offline.add(fn);
        realAdd(type, listener);
      },
    );
    const send = vi.fn<Transport["send"]>(async () => undefined);
    const sync = start({ send });
    const [onOnline] = [...online];
    const [onOffline] = [...offline];

    sync.dispose();
    syncs = [];

    expect(() => onOnline?.(new Event("online"))).not.toThrow();
    expect(() => onOffline?.(new Event("offline"))).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("stops at a pause another tab announced while the backoff runs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    class PeerChannel {
      static all: PeerChannel[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(readonly name: string) {
        PeerChannel.all.push(this);
      }
      postMessage(): void {}
      close(): void {}
    }
    vi.stubGlobal("BroadcastChannel", PeerChannel);
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(503, null, "Wartung");
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));
    await sync.flush(1);
    expect(send).toHaveBeenCalledTimes(1);

    const [peer] = PeerChannel.all;
    peer?.onmessage?.({ data: { type: "paused", reason: "auth" } } as MessageEvent);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(sync.state().paused).toBe("auth");
  });
});
