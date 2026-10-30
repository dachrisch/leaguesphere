import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { apiDelete, apiPut } from "../api/client";
import { getDeviceId } from "../device";
import { lockFrom, takeOver } from "./lock";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    setDeviceId: vi.fn(),
  };
});

const apiPutMock = apiPut as unknown as Mock;
const apiDeleteMock = apiDelete as unknown as Mock;

beforeEach(() => {
  apiPutMock.mockReset();
  apiDeleteMock.mockReset();
});

describe("lockFrom", () => {
  it("reads the lock and the staff permission from a setup answer", () => {
    expect(lockFrom({ locked_elsewhere: true, can_release_lock: false })).toEqual({
      lockedElsewhere: true,
      canRelease: false,
    });
    expect(lockFrom({ locked_elsewhere: false, can_release_lock: true })).toEqual({
      lockedElsewhere: false,
      canRelease: true,
    });
  });

  it("cannot tell from an older server's answer or no answer", () => {
    expect(lockFrom({ ctResult: "home" } as never)).toBeNull();
    expect(lockFrom(null)).toBeNull();
  });
});

describe("takeOver", () => {
  it("releases the lock and claims the game for this device", async () => {
    apiDeleteMock.mockResolvedValue(undefined);
    apiPutMock.mockResolvedValue({});

    await takeOver(42);

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/game/42/device");
    expect(apiPutMock).toHaveBeenCalledWith(
      "/api/game/42/setup",
      { device_id: getDeviceId() },
      { deviceId: getDeviceId() },
    );
    expect(apiDeleteMock.mock.invocationCallOrder[0]).toBeLessThan(
      apiPutMock.mock.invocationCallOrder[0],
    );
  });
});
