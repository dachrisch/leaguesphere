// The queue → HTTP mapping: one test per op kind, plus the two-phase publish.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiDelete, apiPost, apiPut } from "../api/client";
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

const apiPostMock = apiPost as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;
const apiDeleteMock = apiDelete as unknown as Mock;

function op(overrides: Partial<PendingOp> = {}): PendingOp {
  return {
    id: "op-1",
    gameId: 42,
    kind: "event",
    payload: { name: "Touchdown", half: 1 },
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
  apiPostMock.mockReset();
  apiPutMock.mockReset();
  apiDeleteMock.mockReset();
  apiPostMock.mockResolvedValue(LOG);
  apiPutMock.mockResolvedValue(undefined);
  apiDeleteMock.mockResolvedValue(LOG);
});

describe("send", () => {
  it("posts an event with the op id as client_id and the captured device", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(op());

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/gamelog/42",
      { name: "Touchdown", half: 1, client_id: "op-1" },
      { deviceId: "device-a" },
    );
  });

  it("sends no device option for an op that never captured one", async () => {
    const transport = createTransport(() => undefined);

    await transport.send(op({ deviceId: undefined }));

    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/gamelog/42",
      expect.objectContaining({ client_id: "op-1" }),
      undefined,
    );
  });

  it("forwards a delete payload untouched", async () => {
    const transport = createTransport(() => undefined);
    const payload = { sequence: 3 };

    await transport.send(op({ kind: "delete", payload }));

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", payload, {
      deviceId: "device-a",
    });
  });

  it("puts the opening possession and resolves without an answer", async () => {
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "possession", payload: { team: "Ravens" } })),
    ).resolves.toBeUndefined();
    expect(apiPutMock).toHaveBeenCalledWith(
      "/api/game/42/possession",
      { team: "Ravens" },
      { deviceId: "device-a" },
    );
  });

  it("puts the halftime marker", async () => {
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "halftime", payload: {} })),
    ).resolves.toBeUndefined();
    expect(apiPutMock).toHaveBeenCalledWith(
      "/api/game/42/halftime",
      {},
      { deviceId: "device-a" },
    );
  });

  it("treats a replayed halftime as applied, not rejected", async () => {
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { detail: "Keine Halbzeit mehr offen." }, "Keine Halbzeit mehr offen."),
    );
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "halftime", payload: {} })),
    ).resolves.toBeUndefined();
  });

  it("keeps any other halftime failure", async () => {
    const failure = new ApiError(409, { detail: "Anderes Problem." }, "Anderes Problem.");
    apiPutMock.mockRejectedValueOnce(failure);
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "halftime", payload: {} })),
    ).rejects.toBe(failure);
  });

  it("keeps a halftime failure that is not an ApiError", async () => {
    const failure = new TypeError("offline");
    apiPutMock.mockRejectedValueOnce(failure);
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "halftime", payload: {} })),
    ).rejects.toBe(failure);
  });

  it("keeps a halftime 409 without a detail", async () => {
    const failure = new ApiError(409, null);
    apiPutMock.mockRejectedValueOnce(failure);
    const transport = createTransport(() => undefined);

    await expect(
      transport.send(op({ kind: "halftime", payload: {} })),
    ).rejects.toBe(failure);
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
