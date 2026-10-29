// The queue → HTTP mapping: every op is an event append, plus the legacy
// per-row undo, and the two-phase publish.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiDelete, apiGet, apiPost } from "../api/client";
import type { GameLog } from "../api/types";
import type { PendingOp } from "../offline/types";
import { createTransport } from "./transport";

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
const apiDeleteMock = apiDelete as unknown as Mock;

function op(overrides: Partial<PendingOp> = {}): PendingOp {
  return {
    id: "op-1",
    gameId: 42,
    kind: "event",
    payload: {
      events: [{ type: "score", code: "touchdown", side: "home", period: 1 }],
    },
    createdAt: 1_000,
    attempts: 0,
    deviceId: "device-a",
    ...overrides,
  };
}

const LOG = {
  gameId: 42,
  home: { id: 1 },
  away: { id: 2 },
} as unknown as GameLog;

beforeEach(() => {
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiDeleteMock.mockReset();
  apiGetMock.mockResolvedValue(LOG);
  apiPostMock.mockResolvedValue({ state: {}, cursor: 1 });
  apiDeleteMock.mockResolvedValue(LOG);
});

describe("send", () => {
  it("appends the queued events with the op id as client_id and the captured device", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(op());

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      {
        events: [{ type: "score", code: "touchdown", side: "home", period: 1 }],
        client_id: "op-1",
      },
      { deviceId: "device-a" },
    );
  });

  it("reads the log the append answered for, with the same device", async () => {
    const transport = createTransport(() => undefined);

    await expect(transport.send(op())).resolves.toBe(LOG);

    expect(apiGetMock).toHaveBeenCalledWith("/api/gamelog/42", {
      deviceId: "device-a",
    });
  });

  it("sends no device option for an op that never captured one", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(op({ deviceId: undefined }));

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      expect.objectContaining({ client_id: "op-1" }),
      undefined,
    );
    expect(apiGetMock).toHaveBeenCalledWith("/api/gamelog/42", undefined);
  });

  it("appends a possession event like any other event", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(
      op({
        kind: "possession",
        payload: {
          events: [{ type: "possession", code: "away", side: "away" }],
        },
      }),
    );

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      {
        events: [{ type: "possession", code: "away", side: "away" }],
        client_id: "op-1",
      },
      { deviceId: "device-a" },
    );
    expect(apiGetMock).toHaveBeenCalled();
  });

  it("appends the half-time as a period event", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(
      op({
        kind: "halftime",
        payload: { events: [{ type: "period", code: "half_time", side: null }] },
      }),
    );

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      expect.objectContaining({
        events: [{ type: "period", code: "half_time", side: null }],
      }),
      { deviceId: "device-a" },
    );
  });

  it("appends an undo as a correction naming the target seq", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(
      op({
        kind: "correction",
        payload: {
          events: [{ type: "correction", code: "undo", payload: { undo_of: 3 } }],
        },
      }),
    );

    expect(apiPostMock).toHaveBeenCalledWith("/api/game/42/events", {
      events: [{ type: "correction", code: "undo", payload: { undo_of: 3 } }],
      client_id: "op-1",
    }, { deviceId: "device-a" });
  });

  it("keeps the legacy DELETE for a row no event wrote", async () => {
    const transport = createTransport(() => undefined);
    const payload = { team_log_id: 9 };

    await transport.send(op({ kind: "delete", payload }));

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", payload, {
      deviceId: "device-a",
    });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("fails an op from an older app version instead of retrying it forever", async () => {
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "possession", payload: { team: "Ravens" } })),
    ).rejects.toMatchObject({ status: 422 });
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

describe("landed", () => {
  it("publishes a log answer with the op id the screen still holds", () => {
    const onLog = vi.fn();
    const transport = createTransport(onLog);

    transport.landed?.(op({ id: "op-9" }), LOG);

    expect(onLog).toHaveBeenCalledWith(42, LOG, "op-9");
  });

  it("publishes nothing for a non-log answer or a broken one", () => {
    const onLog = vi.fn();
    const transport = createTransport(onLog);

    transport.landed?.(op(), undefined);
    transport.landed?.(op(), null);
    transport.landed?.(op(), { gameId: "42", home: {}, away: {} });

    expect(onLog).not.toHaveBeenCalled();
  });
});

describe("appendEvents", () => {
  it("is the one append-then-read helper the direct writes share", async () => {
    const { appendEvents } = await import("./transport");

    await expect(
      appendEvents(42, [{ type: "score" }], "client-1"),
    ).resolves.toBe(LOG);
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      { events: [{ type: "score" }], client_id: "client-1" },
      undefined,
    );
    expect(apiGetMock).toHaveBeenCalledWith("/api/gamelog/42", undefined);
  });

  it("surfaces a rejected append without reading the log", async () => {
    const { appendEvents } = await import("./transport");
    apiPostMock.mockRejectedValueOnce(
      new ApiError(400, { detail: "Unbekannt." }, "Unbekannt."),
    );

    await expect(appendEvents(42, [], "c")).rejects.toThrow("Unbekannt.");
    expect(apiGetMock).not.toHaveBeenCalled();
  });
});
