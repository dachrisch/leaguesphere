/**
 * The app-wide offline runtime: one outbox, one snapshot store, one sync
 * engine per tab.
 *
 * Boot creates it once; the screens read from it instead of building their own
 * queue, so a log write from the tracking screen and a drain from the `online`
 * listener work on the same rows. The runtime also fans the sync state out to
 * the UI (badge, guards) and publishes every server log a queued write answers
 * with, so an open tracking screen can adopt it.
 *
 * `resetRuntime` exists for tests: the module-level singleton would otherwise
 * carry a paused queue from one test into the next.
 */
import { setDeviceId } from "../api/client";
import type { GameLog } from "../api/types";
import { getDeviceId } from "../device";
import { createOutbox, type Outbox } from "../offline/outbox";
import { createSnapshotStore, type SnapshotStore } from "../offline/snapshot";
import { createSync, type Sync } from "../offline/sync";
import { createTransport } from "./transport";

export interface Runtime {
  readonly outbox: Outbox;
  readonly snapshots: SnapshotStore;
  readonly sync: Sync;
  /** Any sync-state/count change. */
  subscribe(listener: () => void): () => void;
  /** A server log for one game (a flush answer or a re-read). */
  subscribeLog(gameId: number, listener: (log: GameLog) => void): () => void;
  publishLog(gameId: number, log: GameLog): void;
  /** Start the one-time boot work: device header plus an initial flush. */
  start(): void;
  dispose(): void;
}

export interface RuntimeDeps {
  outbox?: Outbox;
  snapshots?: SnapshotStore;
}

type Listener = () => void;

export function createRuntime(deps: RuntimeDeps = {}): Runtime {
  const outbox = deps.outbox ?? createOutbox();
  const snapshots = deps.snapshots ?? createSnapshotStore();

  const listeners = new Set<Listener>();
  const logListeners = new Map<number, Set<(log: GameLog) => void>>();
  let started = false;
  let disposed = false;

  function notify(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One broken subscriber must not stop the others.
      }
    }
  }

  const sync: Sync = createSync(
    outbox,
    createTransport((gameId, log) => publishLog(gameId, log)),
    () => notify(),
  );

  function publishLog(gameId: number, log: GameLog): void {
    if (disposed) {
      return;
    }
    for (const listener of [...(logListeners.get(gameId) ?? [])]) {
      try {
        listener(log);
      } catch {
        // A subscriber is not allowed to break a flush.
      }
    }
    notify();
  }

  return {
    outbox,
    snapshots,
    sync,

    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    subscribeLog(
      gameId: number,
      listener: (log: GameLog) => void,
    ): () => void {
      const set = logListeners.get(gameId) ?? new Set();
      set.add(listener);
      logListeners.set(gameId, set);
      return () => {
        const current = logListeners.get(gameId);
        if (current === undefined) {
          return;
        }
        current.delete(listener);
        if (current.size === 0) {
          logListeners.delete(gameId);
        }
      };
    },

    publishLog,

    start(): void {
      if (started || disposed) {
        return;
      }
      started = true;
      // The device header describes this browser, so it belongs on every
      // write — including queued ops captured after a reload, which would
      // otherwise flush without the lock the game was started under.
      setDeviceId(getDeviceId());
      // Ops left over from the last session (the engine already knows their
      // game ids from IndexedDB); this drains them without waiting for a tap.
      void sync.flushAll();
    },

    dispose(): void {
      disposed = true;
      sync.dispose();
      listeners.clear();
      logListeners.clear();
    },
  };
}

let current: Runtime | null = null;

/** The tab's runtime, created on first use. */
export function getRuntime(): Runtime {
  if (current === null) {
    current = createRuntime();
  }
  return current;
}

/** Test hook: drop the singleton (and its listeners) between tests. */
export function resetRuntime(): void {
  current?.dispose();
  current = null;
}
