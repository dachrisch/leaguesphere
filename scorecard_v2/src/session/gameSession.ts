/**
 * The tracking screen's write path.
 *
 * One function per user action, and every one of them follows the same rule:
 *
 *   online → try the API; a `status === 0` ("not delivered") enqueues the op
 *   with its `client_id` and applies the optimistic log instead of losing it;
 *   offline → enqueue directly, without a request that cannot succeed.
 *
 * Undoing a row that never reached the server removes the queued op locally
 * and never sends `DELETE` — unless that op is being sent right now, in which
 * case the undo is refused with an explanation (removing it would hide a row
 * the server is about to create). Everything else is left to the sync engine,
 * which replays the queue in tap order. The displayed log is always
 * {@link replayOps}(last server payload, queued ops) — nothing is recomputed
 * from scratch, and the next server payload replaces it.
 */
import { ApiError, apiDelete, apiGet, apiPost } from "../api/client";
import type { GameLog, GameLogWrite } from "../api/types";
import { getDeviceId } from "../device";
import { writeSnapshot, snapshotKey } from "../offline/snapshot";
import {
  isDeviceLockError,
  type SyncCounts,
} from "../offline/sync";
import type { OpKind, PendingOp, StoredOp } from "../offline/types";
import {
  correctionEnvelope,
  envelopesForWrite,
  halftimeEnvelope,
  possessionEnvelope,
  sideOfName,
  type EventEnvelope,
} from "./events";
import { newOpId } from "./ids";
import { replayOps } from "./optimistic";
import { eventsPath, logPath } from "./transport";
import { getRuntime, type Runtime } from "./runtime";

/**
 * What an undo names: the event `seq` of the target row (slice 2), or — for a
 * row of a game the old app wrote, whose rows have no event — its `TeamLog`
 * identity, which only the legacy DELETE understands.
 */
export type UndoPayload =
  | { undo_of: number }
  | { sequence: number }
  | { team_log_id: number };

export interface GameSession {
  readonly gameId: number;
  /** The log to render: last server payload plus queued ops. */
  getLog(): GameLog;
  /**
   * `refresh` means the log is authoritative about the game's own state (a
   * re-read, a flush answer, the replayed queue); `write` is this screen's
   * optimistic view, whose `inPossession` still describes the state *before*
   * the tap.
   */
  subscribe(
    listener: (log: GameLog, source: "write" | "refresh") => void,
  ): () => void;
  /** Adopt a server payload (setup start, a re-read, a flush answer). */
  adopt(log: GameLog, source?: "write" | "refresh"): void;
  writeEvent(body: GameLogWrite): Promise<GameLog>;
  /**
   * Undo one log row. `localEventId` is the synthetic (negative) id of a row
   * that came from the queue; it removes that op instead of calling DELETE.
   * Rejects while the engine is sending that op (the row is about to exist
   * server-side), and resolves without a request when the op is gone.
   */
  undo(payload: UndoPayload, localEventId?: number): Promise<GameLog>;
  setPossession(team: string): Promise<void>;
  halftime(): Promise<void>;
  /** Re-read the log. Offline it resolves with the local view. */
  refresh(): Promise<GameLog>;
  /** Wait for the outbox counts the finalise guard needs. */
  counts(): Promise<SyncCounts>;
  dispose(): void;
}

export interface GameSessionOptions {
  gameId: number;
  initialLog: GameLog;
  runtime?: Runtime;
}

function statusOf(error: unknown): number {
  return error instanceof ApiError ? error.status : 0;
}

function offline(): boolean {
  return globalThis.navigator?.onLine === false;
}

/**
 * The log the session starts from must be a server payload. If a caller hands
 * over the rendered (optimistic) log, its synthetic rows would become base
 * data and the next replay would duplicate them (and their undo would no
 * longer find an op). Negative ids are exactly the replay's rows.
 */
function serverOnly(log: GameLog): GameLog {
  if (!Array.isArray(log.events)) {
    return log;
  }
  const events = log.events.filter((event) => event.id >= 0);
  return events.length === log.events.length ? log : { ...log, events };
}

export function createGameSession({
  gameId,
  initialLog,
  runtime = getRuntime(),
}: GameSessionOptions): GameSession {
  const listeners = new Set<
    (log: GameLog, source: "write" | "refresh") => void
  >();
  let base = serverOnly(initialLog);
  let pending: StoredOp[] = [];
  let current = base;
  let opByEventId = new Map<number, string>();
  let disposed = false;
  // Attached on the first subscriber, detached with the last one: a StrictMode
  // remount (or a screen that comes back) re-subscribes without leaking a
  // listener per mount.
  let detachLog: (() => void) | null = null;
  let detachState: (() => void) | null = null;

  function attach(): void {
    if (detachLog === null) {
      detachLog = runtime.subscribeLog(gameId, (log, landedOpId) => {
        // A queued op landed: the server payload (with the queue's remainder)
        // is authoritative, including the possession marker. The op this
        // answer belongs to is already gone from IndexedDB but may still be in
        // this screen's in-memory queue — replaying it here would add it on
        // top of its own answer (a doubled score).
        if (landedOpId !== undefined) {
          pending = pending.filter((op) => op.id !== landedOpId);
        }
        adopt(log, "refresh");
      });
    }
    if (detachState === null) {
      // The engine removes an op *after* publishing its answer, so a drain
      // has to re-read the queue once more: otherwise the optimistic row of
      // the op that just landed would stay on screen.
      detachState = runtime.subscribe(() => {
        if (disposed) {
          return;
        }
        void loadPending("write").catch(() => undefined);
      });
    }
  }

  function detachLogListener(): void {
    if (detachLog !== null) {
      detachLog();
      detachLog = null;
    }
    if (detachState !== null) {
      detachState();
      detachState = null;
    }
  }

  function notify(source: "write" | "refresh"): void {
    for (const listener of [...listeners]) {
      try {
        listener(current, source);
      } catch {
        // A broken subscriber must not break the write path.
      }
    }
  }

  function recompute(source: "write" | "refresh" = "write"): void {
    const replayed = replayOps(base, pending);
    current = replayed.log;
    opByEventId = replayed.opByEventId;
    notify(source);
  }

  /**
   * Park the queue when the server said "you may not write" — the sync engine
   * owns the pause (and its badge); this only reports the same answer the
   * direct write got.
   */
  function noteFailure(error: unknown): void {
    const status = statusOf(error);
    // `401` is the expired session; a `403` on a direct write means "this
    // particular row is not yours to undo", not "log in again".
    if (status === 401) {
      runtime.sync.pause("auth");
    } else if (status === 409 && isDeviceLockError(error)) {
      runtime.sync.pause("device", gameId);
    }
  }

  function adopt(log: GameLog, source: "write" | "refresh" = "write"): void {
    // A caller may hand over the rendered (optimistic) log; its synthetic rows
    // must never become base data, or the next replay duplicates them.
    base = serverOnly(log);
    // The preload is server data only; the optimistic view is rebuilt from
    // this payload and the durable queue, never stored.
    void writeSnapshot(snapshotKey.log(gameId), base);
    recompute(source);
  }

  async function loadPending(
    source: "write" | "refresh" = "write",
  ): Promise<void> {
    pending = await runtime.outbox.pending(gameId);
    recompute(source);
  }

  async function enqueue(
    kind: OpKind,
    payload: unknown,
    id: string = newOpId(),
    attempts = 0,
  ): Promise<void> {
    const op: PendingOp = {
      id,
      gameId,
      kind,
      payload,
      createdAt: Date.now(),
      attempts,
      // The lock the op was admitted under; a later hand-over must not make
      // the replay look like a second device.
      deviceId: getDeviceId(),
    };
    await runtime.outbox.enqueue(op);
    await loadPending();
    // Register the game with the engine and try now; offline the engine is
    // already paused and will drain on the next `online`.
    void runtime.sync.flush(gameId);
  }

  // A reloaded tab has a durable queue but no memory of it; rebuild the view
  // before the first render settles and let the engine drain it.
  void runtime.outbox
    .pending(gameId)
    .then((rows) => {
      if (disposed) {
        return;
      }
      pending = rows;
      recompute("refresh");
      if (rows.length > 0) {
        void runtime.sync.flush(gameId);
      }
    })
    .catch(() => undefined);

  /**
   * Append one submission (a list of envelopes) and adopt the log it produced.
   *
   * Online: POST, then read the log — the append endpoint answers
   * `{state, cursor}`, so the rows it wrote (and their `seq`, which undo
   * needs) only arrive with the read. A POST the network never delivered keeps
   * its `client_id` in the queue; a POST that landed but whose *read* failed is
   * queued the same way, where the replay is a no-op answered with the log.
   */
  async function append(
    kind: OpKind,
    envelopes: EventEnvelope[],
    opId: string = newOpId(),
  ): Promise<GameLog> {
    if (offline()) {
      await enqueue(kind, { events: envelopes }, opId);
      return current;
    }
    try {
      await apiPost(eventsPath(gameId), {
        events: envelopes,
        client_id: opId,
      });
    } catch (error) {
      if (statusOf(error) === 0) {
        await enqueue(kind, { events: envelopes }, opId, 1);
        return current;
      }
      noteFailure(error);
      throw error;
    }
    try {
      const log = await apiGet<GameLog>(logPath(gameId));
      adopt(log);
    } catch {
      // The append was applied; only its log answer was lost. Queue it under
      // the id the server already knows, so the replay cannot apply it twice.
      try {
        await enqueue(kind, { events: envelopes }, opId, 1);
      } catch {
        // No queue to fall back on (private mode, full quota). The write still
        // landed: reporting it as failed would invite the official to tap
        // again and append the same play under a new `client_id`. The next
        // successful read adds the row instead.
      }
    }
    return current;
  }

  return {
    gameId,

    getLog(): GameLog {
      return current;
    },

    subscribe(
      listener: (log: GameLog, source: "write" | "refresh") => void,
    ): () => void {
      disposed = false;
      listeners.add(listener);
      attach();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detachLogListener();
        }
      };
    },

    adopt,

    async writeEvent(body: GameLogWrite): Promise<GameLog> {
      // The side is resolved here, against the log the screen shows: the
      // envelope carries `home`/`away`, not the team name the sheets know.
      const envelopes = envelopesForWrite(body, current);
      return append("event", envelopes);
    },

    async undo(payload: UndoPayload, localEventId?: number): Promise<GameLog> {
      if (localEventId !== undefined) {
        const queuedId = opByEventId.get(localEventId);
        if (queuedId !== undefined) {
          if (runtime.sync.sendingOp(gameId) === queuedId) {
            // The engine is sending this very op. Removing it now would hide a
            // row the server is about to create; queueing a correction is no
            // better, because the row's event `seq` is not known yet.
            throw new Error(
              "Der Eintrag wird gerade übertragen. Bitte gleich noch einmal versuchen.",
            );
          }
          // Never reached the server: drop the op and rebuild the view.
          await runtime.outbox.remove(queuedId);
          await loadPending();
          return current;
        }
        // The op behind this synthetic row is gone (another tab, a reload), so
        // its negative id is not a server id: sending it would be a bogus
        // `team_log_id`. Nothing to undo.
        return current;
      }
      if ("undo_of" in payload) {
        // A stored row: a correction event names the target's event `seq`, and
        // the projector removes the whole submission group (a touchdown and
        // its conversion together).
        return append("correction", [correctionEnvelope(payload.undo_of)]);
      }
      // A row of a game the old app wrote: no event produced it, so only the
      // legacy per-row/sequence DELETE can undo it.
      return undoLegacy(payload);
    },

    async setPossession(team: string): Promise<void> {
      const side = sideOfName(team, current);
      if (side === null) {
        throw new Error(
          `Das Team „${team}“ gehört nicht zu diesem Spiel.`,
        );
      }
      await append("possession", [possessionEnvelope(side)]);
    },

    async halftime(): Promise<void> {
      // The half flips (and the marker row appears) with the log the append
      // answers, not with a local guess: a half-time the server refused must
      // not leave the screen in the second half.
      await append("halftime", [halftimeEnvelope()]);
    },

    async refresh(): Promise<GameLog> {
      if (offline()) {
        return current;
      }
      const log = await apiGet<GameLog>(logPath(gameId));
      adopt(log, "refresh");
      return current;
    },

    async counts(): Promise<SyncCounts> {
      return runtime.sync.counts(gameId);
    },

    dispose(): void {
      disposed = true;
      detachLogListener();
      listeners.clear();
    },
  };

  /** The pre-slice-2 undo: only a row without an event `seq` uses it. */
  async function undoLegacy(
    payload: { sequence: number } | { team_log_id: number },
  ): Promise<GameLog> {
    if (offline()) {
      await enqueue("delete", payload);
      return current;
    }
    try {
      const log = await apiDelete<GameLog>(logPath(gameId), payload);
      // A delete is authoritative for the whole log, possession included.
      adopt(log, "refresh");
      return current;
    } catch (error) {
      if (statusOf(error) === 0) {
        await enqueue("delete", payload);
        return current;
      }
      noteFailure(error);
      throw error;
    }
  }
}
