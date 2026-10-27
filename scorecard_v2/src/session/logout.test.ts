import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSnapshotStore, snapshots } from "../offline/snapshot";
import { LOGOUT_PATH, logout } from "./logout";
import { getRuntime, resetRuntime } from "./runtime";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetRuntime();
  resetSnapshotStore();
  document.cookie = "csrftoken=token-123";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("logout", () => {
  it("clears the queue and the preload, posts the Django logout and leaves", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue({
      id: "op-1",
      gameId: 42,
      kind: "event",
      payload: {},
      createdAt: 1,
      attempts: 0,
      deviceId: "device-a",
    });
    await snapshots().write("gamedays", [{ id: 1 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();

    await logout(navigate);

    await expect(runtime.outbox.pending(42)).resolves.toEqual([]);
    await expect(snapshots().read("gamedays")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      LOGOUT_PATH,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)["X-CSRFToken"]).toBe(
      "token-123",
    );
    expect(String(request.body)).toContain("csrfmiddlewaretoken=token-123");
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("still clears the device and falls back to the logout page offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const navigate = vi.fn();

    await logout(navigate);

    expect(navigate).toHaveBeenCalledWith(LOGOUT_PATH);
  });
});
