/**
 * Live outbox/sync state for the badge and the guards.
 *
 * Counts are read per game from IndexedDB (the durable truth), the pause and
 * "syncing" flags from the engine's state. The pause is asked per game, because
 * a device lock on one game says nothing about another. Every sync notification
 * refreshes both, so a drained queue updates the badge without a re-render of
 * the whole flow.
 */
import { useCallback, useEffect, useState } from "react";

import type { StoredOp } from "../offline/types";
import type { PauseReason } from "../offline/sync";
import { getRuntime } from "./runtime";

export interface SyncStatus {
  pending: number;
  failed: number;
  /** The rejected ops themselves, oldest first, for retry/drop. */
  failedOps: StoredOp[];
  /**
   * The pending ops of the game, oldest first. A session pause blocks them all,
   * and the badge offers "Verwerfen" so an official can move on from a game
   * whose writes will never be accepted.
   */
  pendingOps: StoredOp[];
  syncing: boolean;
  paused: PauseReason | null;
  online: boolean;
  /** Lift a pause and drain again ("Erneut prüfen"). */
  resume: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  drop: (id: string) => Promise<void>;
  refresh: () => void;
}

interface Counts {
  pending: number;
  failed: number;
  failedOps: StoredOp[];
  pendingOps: StoredOp[];
  syncing: boolean;
  paused: PauseReason | null;
  online: boolean;
}

const EMPTY: Counts = {
  pending: 0,
  failed: 0,
  failedOps: [],
  pendingOps: [],
  syncing: false,
  paused: null,
  online: true,
};

export function useSyncStatus(gameId: number | null): SyncStatus {
  const runtime = getRuntime();
  const [counts, setCounts] = useState<Counts>(EMPTY);

  const read = useCallback(async (): Promise<Counts> => {
    // A device lock is one game's state; an auth/offline pause is the app's.
    const state =
      gameId === null ? runtime.sync.state() : runtime.sync.stateFor(gameId);
    const online = globalThis.navigator?.onLine !== false;
    if (gameId === null) {
      return {
        pending: state.pending,
        failed: state.failed,
        failedOps: [],
        pendingOps: [],
        syncing: state.syncing,
        paused: state.paused,
        online,
      };
    }
    try {
      const [game, failedOps, pendingOps] = await Promise.all([
        runtime.sync.counts(gameId),
        runtime.outbox.failed(gameId),
        runtime.outbox.pending(gameId),
      ]);
      return {
        pending: game.pending,
        failed: game.failed,
        failedOps,
        pendingOps,
        syncing: state.syncing,
        paused: state.paused,
        online,
      };
    } catch {
      // IndexedDB unavailable: report the engine's aggregate instead of
      // throwing a badge off the screen.
      return {
        pending: state.pending,
        failed: state.failed,
        failedOps: [],
        pendingOps: [],
        syncing: state.syncing,
        paused: state.paused,
        online,
      };
    }
  }, [gameId, runtime]);

  const refresh = useCallback((): void => {
    void read().then(setCounts, () => undefined);
  }, [read]);

  useEffect(() => {
    let active = true;
    const update = (): void => {
      void read().then(
        (next) => {
          if (active) {
            setCounts(next);
          }
        },
        () => undefined,
      );
    };
    update();
    const unsubscribe = runtime.subscribe(update);
    globalThis.addEventListener?.("online", update);
    globalThis.addEventListener?.("offline", update);
    return () => {
      active = false;
      unsubscribe();
      globalThis.removeEventListener?.("online", update);
      globalThis.removeEventListener?.("offline", update);
    };
  }, [read, runtime]);

  const resume = useCallback(async (): Promise<void> => {
    // Only this game's device pause is lifted here; the engine keeps the
    // app-wide pause in step, so a re-login still unlocks every game.
    await runtime.sync.resume(gameId ?? undefined);
    refresh();
  }, [gameId, refresh, runtime]);

  const retry = useCallback(
    async (id: string): Promise<void> => {
      await runtime.outbox.retry(id);
      // A rejected op goes back into the FIFO at its original position; the
      // engine's own pause (if any) is what the badge's "Erneut prüfen" lifts.
      if (gameId !== null) {
        await runtime.sync.flush(gameId);
      } else {
        await runtime.sync.flushAll();
      }
      refresh();
    },
    [gameId, refresh, runtime],
  );

  const drop = useCallback(
    async (id: string): Promise<void> => {
      await runtime.outbox.remove(id);
      refresh();
    },
    [refresh, runtime],
  );

  return { ...counts, resume, retry, drop, refresh };
}
