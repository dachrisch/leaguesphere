// The session is the one write path of the tracking screen; these tests pin
// the offline rules the plan calls out.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type { GameLog, GameLogTeam } from "../api/types";
import { createOutbox, type Outbox } from "../offline/outbox";
import { resetSnapshotStore } from "../offline/snapshot";
import { createGameSession, type GameSession } from "./gameSession";
import { createRuntime, type Runtime } from "./runtime";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
  };
});

const apiGetMock = apiGet as unknown as Mock;
const apiPostMock = apiPost as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;
const apiDeleteMock = apiDelete as unknown as Mock;

function team(overrides: Partial<GameLogTeam> = {}): GameLogTeam {
  return {
    id: 1,
    name: "Ravens",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
    ...overrides,
  };
}

function serverLog(overrides: Partial<GameLog> = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(),
    away: team({ id: 2, name: "Wolves" }),
    ...overrides,
  };
}

const WRITE = {
  gameId: 42,
  team: "Ravens",
  half: 1 as const,
  event: [
    { name: "Touchdown", player: 23 },
    { name: "1-Extra-Punkt", player: 23 },
  ],
};

function setOnline(online: boolean): void {
  vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(online);
}

let outbox: Outbox;
let runtime: Runtime;
let session: GameSession;

function makeSession(initialLog: GameLog = serverLog()): GameSession {
  const created = createGameSession({ gameId: 42, initialLog, runtime });
  // A mounted screen always subscribes; the session attaches its runtime
  // listeners on the first subscriber.
  created.subscribe(() => undefined);
  return created;
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetSnapshotStore();
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiPutMock.mockReset();
  apiDeleteMock.mockReset();
  outbox = createOutbox();
});

afterEach(() => {
  session?.dispose();
  runtime?.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offline writes", () => {
  beforeEach(() => {
    setOnline(false);
    runtime = createRuntime({ outbox });
    session = makeSession();
  });

  it("queues an event without a request and shows it optimistically", async () => {
    const shown = await session.writeEvent(WRITE);

    expect(apiPostMock).not.toHaveBeenCalled();
    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("event");
    expect(pending[0].payload).toEqual(WRITE);
    expect(shown.home.score).toBe(7);
    expect(shown.events?.[0].event).toBe("1-Extra-Punkt");
    await expect(session.counts()).resolves.toEqual({ pending: 1, failed: 0 });
  });

  it("removes a queued op on undo and never calls DELETE", async () => {
    const shown = await session.writeEvent(WRITE);
    const localId = shown.events?.[0].id ?? 0;

    const reverted = await session.undo({ sequence: 1 }, localId);

    expect(apiDeleteMock).not.toHaveBeenCalled();
    await expect(outbox.pending(42)).resolves.toEqual([]);
    expect(reverted.home.score).toBe(0);
    expect(reverted.events).toEqual([]);
  });

  it("queues possession and half-time", async () => {
    await session.setPossession("Wolves");
    await session.halftime();

    const pending = await outbox.pending(42);
    expect(pending.map((entry) => entry.kind)).toEqual([
      "possession",
      "halftime",
    ]);
    expect(session.getLog().inPossession).toBe("Wolves");
    expect(session.getLog().isFirstHalf).toBe(false);
    expect(apiPutMock).not.toHaveBeenCalled();
  });

  it("undoes a synced row by queueing the delete", async () => {
    await session.undo({ team_log_id: 9 });

    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("delete");
    expect(pending[0].payload).toEqual({ team_log_id: 9 });
    expect(apiDeleteMock).not.toHaveBeenCalled();
  });
});

describe("online writes", () => {
  beforeEach(() => {
    setOnline(true);
    runtime = createRuntime({ outbox });
    session = makeSession();
  });

  it("sends the client id and adopts the server log", async () => {
    apiPostMock.mockResolvedValue(serverLog({ home: team({ score: 7 }) }));

    const shown = await session.writeEvent(WRITE);

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    const [path, body] = apiPostMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/gamelog/42");
    expect(body).toEqual(expect.objectContaining(WRITE));
    expect(typeof body.client_id).toBe("string");
    expect((body.client_id as string).length).toBeGreaterThan(20);
    expect(shown.home.score).toBe(7);
    await expect(outbox.pending(42)).resolves.toEqual([]);
  });

  it("queues the write with the same client id when the answer was lost", async () => {
    apiPostMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

    const shown = await session.writeEvent(WRITE);

    const sentId = (apiPostMock.mock.calls[0][1] as { client_id: string })
      .client_id;
    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(sentId);
    expect(pending[0].attempts).toBe(1);
    expect(shown.home.score).toBe(7);
  });

  it("keeps a rejected write out of the queue and surfaces the detail", async () => {
    apiPostMock.mockRejectedValue(
      new ApiError(400, { detail: "Bad payload" }, "Bad payload"),
    );

    await expect(session.writeEvent(WRITE)).rejects.toThrow("Bad payload");
    await expect(outbox.pending(42)).resolves.toEqual([]);
  });

  it("switches the app to read-only on a device-lock answer", async () => {
    apiPostMock.mockRejectedValue(
      new ApiError(
        409,
        {
          detail: "Dieses Spiel läuft auf einem anderen Gerät.",
          device_id: "device-b",
        },
        "Dieses Spiel läuft auf einem anderen Gerät.",
      ),
    );

    await expect(session.writeEvent(WRITE)).rejects.toThrow(
      "anderen Gerät",
    );
    expect(runtime.sync.stateFor(42).paused).toBe("device");
  });

  it("re-reads the log through the snapshot-backed refresh", async () => {
    apiGetMock.mockResolvedValue(serverLog({ inPossession: "Wolves" }));

    const fresh = await session.refresh();

    expect(apiGetMock).toHaveBeenCalledWith("/api/gamelog/42");
    expect(fresh.inPossession).toBe("Wolves");
  });

  it("starts from server rows even if handed the optimistic view", async () => {
    // The finalise screen shows the optimistic log; coming back must not turn
    // its synthetic rows into base data.
    const optimistic = serverLog({
      events: [
        {
          id: -1,
          sequence: 1,
          team: "Ravens",
          event: "First Down",
          player: null,
          input: null,
          half: 1,
          cop: false,
          isDeleted: false,
          time: "2026-10-26T12:00:00Z",
        },
      ],
    });
    session = makeSession(optimistic);

    await vi.waitFor(() => expect(session.getLog().events).toEqual([]));
  });
});

describe("undo guards", () => {
  it("never drops an op that is being sent right now", async () => {
    setOnline(false);
    runtime = createRuntime({ outbox });
    session = makeSession();
    const shown = await session.writeEvent(WRITE);
    const localId = shown.events?.[0].id ?? 0;
    const [op] = await outbox.pending(42);

    setOnline(true);
    const gate: { release?: () => void } = {};
    apiPostMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          gate.release = () => resolve(serverLog({ home: team({ score: 7 }) }));
        }),
    );
    const flushing = runtime.sync.resume();
    await vi.waitFor(() => expect(runtime.sync.sendingOp(42)).toBe(op.id));

    // Removing the row now would hide an entry the server is about to create.
    await expect(session.undo({ sequence: 1 }, localId)).rejects.toThrow(
      "gerade übertragen",
    );
    await expect(outbox.get(op.id)).resolves.toBeDefined();

    gate.release?.();
    await flushing;
    await vi.waitFor(async () => expect(outbox.get(op.id)).resolves.toBeUndefined());
  });

  it("sends nothing for a synthetic row whose op is gone", async () => {
    setOnline(true);
    runtime = createRuntime({ outbox });
    session = makeSession();

    // A negative id is a local replay id, never a `TeamLog` pk: sending it as
    // `team_log_id` would be a request for a row that cannot exist.
    await session.undo({ team_log_id: -5 }, -5);

    expect(apiDeleteMock).not.toHaveBeenCalled();
    expect(await outbox.pending(42)).toEqual([]);
  });
});

describe("flush", () => {
  it("never shows a flushed write twice", async () => {
    // The answer is published while the op is still queued if `send` publishes:
    // the session then replays the pending touchdown on top of the server's
    // score and the screen flashes the double count.
    setOnline(false);
    runtime = createRuntime({ outbox });
    session = makeSession();
    const scores: number[] = [];
    session.subscribe((shown) => scores.push(shown.home.score));

    await session.writeEvent(WRITE);
    expect(session.getLog().home.score).toBe(7);

    setOnline(true);
    apiPostMock.mockResolvedValue(serverLog({ home: team({ score: 7 }) }));
    await runtime.sync.resume();

    await vi.waitFor(() => expect(session.getLog().home.score).toBe(7));
    await vi.waitFor(async () =>
      expect(await outbox.pending(42)).toEqual([]),
    );
    // 14 would be the queued touchdown added a second time.
    expect(scores).not.toContain(14);
  });

  it("drains the queue in tap order and adopts the last server log", async () => {
    setOnline(false);
    runtime = createRuntime({ outbox });
    session = makeSession();

    await session.writeEvent({
      gameId: 42,
      team: "Ravens",
      half: 1,
      event: [{ name: "First Down" }],
    });
    await session.setPossession("Wolves");

    setOnline(true);
    apiPostMock.mockResolvedValue(serverLog({ inPossession: "Ravens" }));
    apiPutMock.mockResolvedValue(undefined);
    const finalLog = serverLog({
      inPossession: "Wolves",
      home: team({ score: 0 }),
      events: [
        {
          id: 99,
          sequence: 1,
          team: "Ravens",
          event: "First Down",
          player: null,
          input: null,
          half: 1,
          cop: false,
          isDeleted: false,
          time: "2026-10-26T12:00:00Z",
        },
      ],
    });

    await runtime.sync.resume();
    // The last server payload wins.
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(
      "/api/game/42/possession",
      { team: "Wolves" },
      expect.objectContaining({ deviceId: expect.any(String) }),
    );
    expect(apiPostMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        gameId: 42,
        team: "Ravens",
        half: 1,
        event: [{ name: "First Down" }],
        client_id: expect.any(String),
      }),
    );
    await expect(outbox.pending(42)).resolves.toEqual([]);
    // The replay is rebuilt after the drain, so the optimistic row is gone.
    await vi.waitFor(() => expect(session.getLog().events).toEqual([]));

    // A later server answer for the game is adopted as authority.
    runtime.publishLog(42, finalLog);
    expect(session.getLog().events?.[0].id).toBe(99);
    expect(session.getLog().inPossession).toBe("Wolves");
  });
});

describe("the not-delivered fallbacks", () => {
  beforeEach(() => {
    setOnline(true);
    runtime = createRuntime({ outbox });
    session = makeSession();
  });

  it("queues a delete the network never delivered", async () => {
    apiDeleteMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await session.undo({ sequence: 3 });

    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("delete");
    expect(pending[0].payload).toEqual({ sequence: 3 });
  });

  it("queues a possession change the network never delivered", async () => {
    apiPutMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

    await session.setPossession("Wolves");

    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("possession");
    expect(pending[0].payload).toEqual({ team: "Wolves" });
  });

  it("queues a half-time the network never delivered", async () => {
    apiPutMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

    await session.halftime();

    const pending = await outbox.pending(42);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("halftime");
    // The replay already flips the half and adds the marker row.
    expect(session.getLog().isFirstHalf).toBe(false);
  });

  it("keeps a rejected possession change out of the queue", async () => {
    apiPutMock.mockRejectedValue(
      new ApiError(400, { detail: "Team unbekannt." }, "Team unbekannt."),
    );

    await expect(session.setPossession("Wolves")).rejects.toThrow(
      "Team unbekannt.",
    );
    await expect(outbox.pending(42)).resolves.toEqual([]);
  });

  it("keeps a rejected half-time out of the queue", async () => {
    apiPutMock.mockRejectedValue(
      new ApiError(409, { detail: "Keine Halbzeit." }, "Keine Halbzeit."),
    );

    await expect(session.halftime()).rejects.toThrow("Keine Halbzeit.");
    await expect(outbox.pending(42)).resolves.toEqual([]);
  });

  it("pauses the queue on an expired session", async () => {
    apiPostMock.mockRejectedValue(
      new ApiError(401, { detail: "Anmeldung abgelaufen." }, "Anmeldung abgelaufen."),
    );

    await expect(session.writeEvent(WRITE)).rejects.toThrow("abgelaufen");
    expect(runtime.sync.state().paused).toBe("auth");
  });

  it("answers a refresh offline from the local view", async () => {
    const before = session.getLog();
    setOnline(false);

    await expect(session.refresh()).resolves.toBe(before);
    expect(apiGetMock).not.toHaveBeenCalled();
  });
});

describe("listener lifecycle", () => {
  beforeEach(() => {
    setOnline(false);
    runtime = createRuntime({ outbox });
  });

  it("detaches the runtime listeners with the last subscriber", async () => {
    session = createGameSession({ gameId: 42, initialLog: serverLog(), runtime });
    const unsubscribe = session.subscribe(() => undefined);

    unsubscribe();

    // Publishing after the last subscriber is harmless: nothing listens.
    expect(() => runtime.publishLog(42, serverLog())).not.toThrow();
    expect(session.getLog().inPossession).toBe("Ravens");
  });

  it("can be disposed twice", () => {
    session = makeSession();

    expect(() => {
      session.dispose();
      session.dispose();
    }).not.toThrow();
  });
});

describe("the successful direct writes", () => {
  beforeEach(() => {
    setOnline(true);
    runtime = createRuntime({ outbox });
    session = makeSession();
  });

  it("adopts the whole log the delete answered with", async () => {
    apiDeleteMock.mockResolvedValue(
      serverLog({ home: team({ score: 0 }), inPossession: "Wolves" }),
    );

    const shown = await session.undo({ sequence: 1 });

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", {
      sequence: 1,
    });
    expect(shown.inPossession).toBe("Wolves");
    expect(session.getLog().inPossession).toBe("Wolves");
  });

  it("keeps a rejected delete out of the queue", async () => {
    apiDeleteMock.mockRejectedValue(
      new ApiError(403, { detail: "Nicht dein Eintrag." }, "Nicht dein Eintrag."),
    );

    await expect(session.undo({ sequence: 1 })).rejects.toThrow(
      "Nicht dein Eintrag.",
    );
    await expect(outbox.pending(42)).resolves.toEqual([]);
  });

  it("flips the half after the server accepted the half-time", async () => {
    apiPutMock.mockResolvedValue(undefined);

    await session.halftime();

    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/halftime", {});
    expect(session.getLog().isFirstHalf).toBe(false);
  });
});

describe("a reloaded queue", () => {
  it("rebuilds the view from the rows a previous tab left", async () => {
    runtime = createRuntime({ outbox });
    await outbox.enqueue({
      id: "left-over",
      gameId: 42,
      kind: "event",
      payload: {
        gameId: 42,
        team: "Ravens",
        half: 1,
        event: [{ name: "First Down" }],
      },
      createdAt: 1,
      attempts: 0,
      deviceId: "device-a",
    });
    setOnline(false);
    session = createGameSession({ gameId: 42, initialLog: serverLog(), runtime });

    await vi.waitFor(() =>
      expect(session.getLog().events?.map((event) => event.event)).toContain(
        "First Down",
      ),
    );
  });

  it("keeps the base log when the queue cannot be read", async () => {
    runtime = createRuntime({ outbox });
    const failure = vi
      .spyOn(outbox, "pending")
      .mockRejectedValue(new Error("IndexedDB weg"));
    setOnline(false);

    session = createGameSession({ gameId: 42, initialLog: serverLog(), runtime });

    await vi.waitFor(() => expect(failure).toHaveBeenCalled());
    expect(session.getLog().events).toEqual([]);
  });
});
