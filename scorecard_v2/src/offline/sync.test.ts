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
  createSync,
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
    expect(sync.state()).toMatchObject({ pending: 2, failed: 0, paused: "device" });
  });

  it("detects the device lock from the device_id in the body", async () => {
    const send = vi.fn<Transport["send"]>(async () => {
      throw new ApiError(409, { device_id: "device-b" });
    });
    const sync = start({ send });
    await outbox.enqueue(op({ id: "a" }));

    await sync.flush(1);

    expect(sync.state().paused).toBe("device");
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

describe("cross-tab", () => {
  class FakeChannel {
    static all: FakeChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      FakeChannel.all.push(this);
    }

    postMessage(data: unknown): void {
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

    expect(other.state().paused).toBe("device");
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
});
