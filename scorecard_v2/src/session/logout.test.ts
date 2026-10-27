import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSnapshotStore, snapshots } from "../offline/snapshot";
import {
  LOGOUT_PATH,
  logout,
  logoutWarning,
  queuedWrites,
} from "./logout";
import { getRuntime, resetRuntime } from "./runtime";

function queuedOp(id: string, gameId = 42) {
  return {
    id,
    gameId,
    kind: "event" as const,
    payload: {},
    createdAt: 1,
    attempts: 0,
    deviceId: "device-a",
  };
}

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
  it("asks before dropping unsent writes and keeps them when declined", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(queuedOp("op-1"));
    await runtime.outbox.enqueue(queuedOp("op-2"));
    await snapshots().write("gamedays", [{ id: 1 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();
    const confirm = vi.fn().mockReturnValue(false);

    await logout(navigate, confirm);

    expect(confirm).toHaveBeenCalledWith(
      "2 Einträge sind noch nicht übertragen. Trotzdem abmelden?",
    );
    // Nothing happened: the queue and the preload are still there, the session
    // is still open and the app did not navigate away.
    await expect(runtime.outbox.pending(42)).resolves.toHaveLength(2);
    await expect(snapshots().read("gamedays")).resolves.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears the queue and the preload, posts the Django logout and leaves", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(queuedOp("op-1"));
    await snapshots().write("gamedays", [{ id: 1 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();
    const confirm = vi.fn().mockReturnValue(true);

    await logout(navigate, confirm);

    expect(confirm).toHaveBeenCalledWith(
      "1 Eintrag ist noch nicht übertragen. Trotzdem abmelden?",
    );
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

  it("does not ask when nothing is queued", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const navigate = vi.fn();
    const confirm = vi.fn();

    await logout(navigate, confirm);

    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(LOGOUT_PATH);
  });

  it("counts a rejected write as unsent too", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(queuedOp("op-1"));
    await runtime.outbox.markFailed("op-1", "Eintrag ungültig.");

    await expect(queuedWrites()).resolves.toEqual({ pending: 0, failed: 1 });
    expect(logoutWarning(3)).toBe(
      "3 Einträge sind noch nicht übertragen. Trotzdem abmelden?",
    );
  });
});

describe("cookies and defaults", () => {
  function clearCookies(): void {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name !== undefined && name !== "") {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    }
  }

  it("reads a malformed csrf cookie as it is", async () => {
    clearCookies();
    // A stray cookie without a value and a broken percent escape before the
    // token: both must not stop the logout.
    document.cookie = "stray";
    document.cookie = "csrftoken=%E0%A4%A";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await logout(vi.fn(), vi.fn().mockReturnValue(true));

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)["X-CSRFToken"]).toBe(
      "%E0%A4%A",
    );
  });

  it("sends no csrf field when the cookie is missing", async () => {
    clearCookies();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await logout(vi.fn(), vi.fn().mockReturnValue(true));

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect((request.headers as Record<string, string>)["X-CSRFToken"]).toBeUndefined();
    expect(String(request.body)).not.toContain("csrfmiddlewaretoken");
  });

  it("reads a broken store as nothing queued", async () => {
    vi.spyOn(getRuntime().outbox, "gameIds").mockRejectedValue(
      new Error("IndexedDB weg"),
    );

    await expect(queuedWrites()).resolves.toEqual({ pending: 0, failed: 0 });
  });

  it("asks the browser when no confirm was injected", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(queuedOp("op-1"));
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    const navigate = vi.fn();

    await logout(navigate);

    expect(confirm).toHaveBeenCalledWith(
      "1 Eintrag ist noch nicht übertragen. Trotzdem abmelden?",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not ask when the browser has no confirm at all", async () => {
    vi.stubGlobal("confirm", undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();

    await logout(navigate);

    expect(fetchMock).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
