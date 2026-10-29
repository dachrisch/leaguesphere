// The badge's data source: durable counts per game, the engine's pause, and
// the three actions the badge offers.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiPost } from "../api/client";
import { resetSnapshotStore } from "../offline/snapshot";
import type { PendingOp } from "../offline/types";
import { getRuntime, resetRuntime } from "./runtime";
import { useSyncStatus } from "./useSyncStatus";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, apiPost: vi.fn() };
});

function op(overrides: Partial<PendingOp> = {}): PendingOp {
  return {
    id: "op-1",
    gameId: 42,
    kind: "event",
    // A real append payload: an empty one is refused before it leaves.
    payload: {
      events: [{ type: "score", code: "touchdown", side: "home", period: 1 }],
    },
    createdAt: 1,
    attempts: 0,
    deviceId: "device-a",
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetRuntime();
  resetSnapshotStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSyncStatus without a game", () => {
  it("reports the engine's aggregate counts", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(op({ id: "a", gameId: 1 }));
    await runtime.outbox.enqueue(op({ id: "b", gameId: 2 }));
    await runtime.outbox.markFailed("b", "HTTP 422");
    // The flush registers both games with the engine; the transport fails, so
    // nothing leaves the queue and the counts stay durable.
    (apiPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(0, null, "Keine Verbindung"),
    );
    await runtime.sync.flushAll();
    await waitFor(() => expect(runtime.sync.state().pending).toBe(1));

    const { result } = renderHook(() => useSyncStatus(null));

    await waitFor(() => expect(result.current.pending).toBe(1));
    expect(result.current.failed).toBe(1);
    // Without a game there is no per-row list to offer.
    expect(result.current.failedOps).toEqual([]);
    expect(result.current.pendingOps).toEqual([]);
    expect(result.current.online).toBe(true);
  });

  it("retries a rejected op against every game", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(op({ id: "a", gameId: 1 }));
    await runtime.outbox.markFailed("a", "HTTP 422");
    const flushAll = vi.spyOn(runtime.sync, "flushAll").mockResolvedValue();
    const { result } = renderHook(() => useSyncStatus(null));

    await act(async () => {
      await result.current.retry("a");
    });

    expect(await runtime.outbox.failed(1)).toEqual([]);
    expect(flushAll).toHaveBeenCalled();
  });
});

describe("useSyncStatus for one game", () => {
  it("reads the rows of that game", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(op({ id: "a", gameId: 42 }));
    await runtime.outbox.enqueue(op({ id: "b", gameId: 42 }));
    await runtime.outbox.markFailed("b", "HTTP 422");

    const { result } = renderHook(() => useSyncStatus(42));

    await waitFor(() => expect(result.current.pending).toBe(1));
    expect(result.current.failed).toBe(1);
    expect(result.current.pendingOps.map((entry) => entry.id)).toEqual(["a"]);
    expect(result.current.failedOps.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("resumes that game's pause and retries through its queue", async () => {
    const runtime = getRuntime();
    const resume = vi.spyOn(runtime.sync, "resume").mockResolvedValue();
    const flush = vi.spyOn(runtime.sync, "flush").mockResolvedValue();
    const { result } = renderHook(() => useSyncStatus(42));

    await act(async () => {
      await result.current.resume();
      await result.current.retry("op-9");
    });

    expect(resume).toHaveBeenCalledWith(42);
    expect(flush).toHaveBeenCalledWith(42);
  });

  it("drops the pause for the whole app when there is no game", async () => {
    const runtime = getRuntime();
    const resume = vi.spyOn(runtime.sync, "resume").mockResolvedValue();
    const { result } = renderHook(() => useSyncStatus(null));

    await act(async () => {
      await result.current.resume();
    });

    expect(resume).toHaveBeenCalledWith(undefined);
  });

  it("drops one row and refreshes", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(op({ id: "a", gameId: 42 }));
    await runtime.outbox.markFailed("a", "HTTP 422");
    const { result } = renderHook(() => useSyncStatus(42));
    await waitFor(() => expect(result.current.failed).toBe(1));

    await act(async () => {
      await result.current.drop("a");
    });

    await waitFor(() => expect(result.current.failed).toBe(0));
    expect(await runtime.outbox.failed(42)).toEqual([]);
  });

  it("falls back to the engine's counts when the store cannot be read", async () => {
    const runtime = getRuntime();
    const broken = vi
      .spyOn(runtime.outbox, "pending")
      .mockRejectedValue(new Error("IndexedDB weg"));
    const { result } = renderHook(() => useSyncStatus(42));

    await waitFor(() => expect(broken).toHaveBeenCalled());
    expect(result.current.pending).toBe(0);
    expect(result.current.failed).toBe(0);
    expect(result.current.failedOps).toEqual([]);
    expect(result.current.pendingOps).toEqual([]);
  });

  it("does not throw when the engine's own state cannot be read", async () => {
    const runtime = getRuntime();
    vi.spyOn(runtime.sync, "state").mockImplementation(() => {
      throw new Error("Engine weg");
    });

    const { result } = renderHook(() => useSyncStatus(null));

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.paused).toBeNull();
  });

  it("re-reads when the browser reports a network change", async () => {
    const runtime = getRuntime();
    await runtime.outbox.enqueue(op({ id: "a", gameId: 42 }));
    const { result } = renderHook(() => useSyncStatus(42));
    await waitFor(() => expect(result.current.pending).toBe(1));

    await runtime.outbox.remove("a");
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
  });

  it("stops listening when the screen unmounts", async () => {
    const runtime = getRuntime();
    const remove = vi.spyOn(runtime, "subscribe");
    const { unmount } = renderHook(() => useSyncStatus(42));

    const unsubscribe = () => undefined;
    expect(remove).toHaveBeenCalled();
    unmount();
    expect(() => unsubscribe()).not.toThrow();
  });
});
