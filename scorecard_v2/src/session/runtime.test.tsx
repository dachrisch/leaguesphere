// The runtime's fan-out: log listeners, state listeners, the one-time boot and
// the dispose that silences both.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameLog } from "../api/types";
import { resetSnapshotStore } from "../offline/snapshot";
import { createRuntime, getRuntime, resetRuntime } from "./runtime";

const LOG = { gameId: 42, home: {}, away: {} } as unknown as GameLog;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetRuntime();
  resetSnapshotStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtime", () => {
  it("publishes a log with the landed op id and notifies the badge", () => {
    const runtime = createRuntime();
    const log = vi.fn();
    const state = vi.fn();
    runtime.subscribeLog(42, log);
    runtime.subscribe(state);

    runtime.publishLog(42, LOG, "op-1");

    expect(log).toHaveBeenCalledWith(LOG, "op-1");
    expect(state).toHaveBeenCalled();
  });

  it("keeps one broken subscriber from hiding the answer", () => {
    const runtime = createRuntime();
    const log = vi.fn();
    runtime.subscribeLog(42, () => {
      throw new Error("kaputt");
    });
    runtime.subscribeLog(42, log);
    runtime.subscribe(() => {
      throw new Error("kaputt");
    });

    expect(() => runtime.publishLog(42, LOG)).not.toThrow();
    expect(log).toHaveBeenCalledWith(LOG, undefined);
  });

  it("stops publishing after dispose", () => {
    const runtime = createRuntime();
    const log = vi.fn();
    runtime.subscribeLog(42, log);

    runtime.dispose();
    runtime.publishLog(42, LOG);

    expect(log).not.toHaveBeenCalled();
  });

  it("unsubscribes a log listener once and ignores a second call", () => {
    const runtime = createRuntime();
    const log = vi.fn();
    const unsubscribe = runtime.subscribeLog(42, log);

    unsubscribe();
    unsubscribe();
    runtime.publishLog(42, LOG);

    expect(log).not.toHaveBeenCalled();
  });

  it("unsubscribes a state listener", () => {
    const runtime = createRuntime();
    const state = vi.fn();
    const unsubscribe = runtime.subscribe(state);
    unsubscribe();

    runtime.publishLog(42, LOG);

    expect(state).not.toHaveBeenCalled();
  });

  it("boots once and exposes its stores", async () => {
    const runtime = createRuntime();

    runtime.start();
    runtime.start();

    // The second start is a no-op; the queue is still usable.
    await expect(runtime.outbox.gameIds()).resolves.toEqual([]);
    await expect(runtime.snapshots.read("gamedays")).resolves.toBeUndefined();
  });

  it("is a singleton until it is reset", () => {
    const first = getRuntime();
    expect(getRuntime()).toBe(first);

    resetRuntime();
    expect(getRuntime()).not.toBe(first);
  });
});
