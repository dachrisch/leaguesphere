/**
 * The sync engine: drains one game's outbox, one op at a time, FIFO.
 *
 * Why it looks like this:
 *
 * - **FIFO and stop-on-transient.** The server rebuilds the log from the order
 *   it receives, so an op is only skipped when the server will never accept it
 *   (`400`/`422` → failed). A network failure or a `5xx` stops the flush and
 *   keeps the rest: reordering a game's events is worse than a late sync.
 * - **Pauses instead of deletions.** `401`/`403` (expired session) and a `409`
 *   device-lock answer must not destroy a game's events; they pause the queue
 *   until the app calls {@link Sync.resume} (`"device"` also means read-only).
 * - **One drainer.** An in-module promise per game stops a double tap from
 *   sending twice, and `navigator.locks` stops a second tab from draining the
 *   same game. The server's `client_id` dedupe is the last line of defence.
 * - **No spinning.** A stopped flush schedules a capped exponential retry
 *   (1 s → 30 s); `online` and a visible tab reset the backoff and retry now.
 * - **Tabs cooperate.** A `BroadcastChannel` tells the other tabs to re-read
 *   the queue (they never share memory, only the IndexedDB rows).
 */
import type { Outbox } from "./outbox";
import type { PendingOp } from "./types";

export const CHANNEL_NAME = "scorecard-v2";
/** The server's answer when another device holds the game lock. */
export const DEVICE_LOCK_DETAIL = "Dieses Spiel läuft auf einem anderen Gerät.";

const LOCK_PREFIX = "outbox-";
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export interface Transport {
  /** Rejects with an `ApiError`-shaped error; resolves means "delivered". */
  send(op: PendingOp): Promise<void>;
}

export interface SyncState {
  /** Ops still waiting to be delivered, across every game this engine drained. */
  pending: number;
  /** Ops the server rejected; they need a retry or a drop. */
  failed: number;
  syncing: boolean;
  paused: "offline" | "auth" | "device" | null;
}

export type PauseReason = NonNullable<SyncState["paused"]>;

export interface SyncCounts {
  pending: number;
  failed: number;
}

export interface Sync {
  /** Drain one game. Resolves when the flush stopped, never rejects. */
  flush(gameId: number): Promise<void>;
  /** Drain every game this engine has seen (used by `online`). */
  flushAll(): Promise<void>;
  /** The queue of one game, for the badge and the finalise guard. */
  counts(gameId: number): Promise<SyncCounts>;
  state(): SyncState;
  /** Stop sending until {@link Sync.resume}. Default reason: `"offline"`. */
  pause(reason?: PauseReason): void;
  /** Clear a pause and drain again (after a re-login, or a staff unlock). */
  resume(): Promise<void>;
  /** Remove listeners, timers and the channel. The queue itself survives. */
  dispose(): void;
}

type SyncMessage =
  | { type: "changed"; gameId: number }
  | { type: "paused"; reason: PauseReason }
  | { type: "resumed" };

type Verdict =
  | { kind: "transient"; reason: "offline" | "server" }
  | { kind: "auth" }
  | { kind: "device" }
  | { kind: "rejected"; reason: string };

type Outcome =
  | { kind: "sent" }
  | { kind: "rejected" }
  | { kind: "stopped"; reason: "offline" | "server" }
  | { kind: "paused" };

function statusOf(error: unknown): number {
  if (typeof error === "object" && error !== null) {
    const { status } = error as { status?: unknown };
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }
  // Anything else (a TypeError from the transport, an aborted fetch) is "not
  // delivered": keeping the op is always safer than dropping it.
  return 0;
}

function fieldOf(error: unknown, field: "detail" | "message"): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The server marks a device conflict in the body (`device_id`), not a flag. */
function looksLikeDeviceLock(error: unknown): boolean {
  if (fieldOf(error, "detail") === DEVICE_LOCK_DETAIL) {
    return true;
  }
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { body } = error as { body?: unknown };
  return typeof body === "object" && body !== null && "device_id" in body;
}

/**
 * Classify a send failure. `400`/`422` are the only statuses the plan names as
 * "rejected", but every other non-transient, non-auth status means the same
 * thing: re-sending that exact payload will fail again, so it must not block
 * the queue. `408` and `429` are retries, not rejections.
 */
export function classify(error: unknown): Verdict {
  const status = statusOf(error);
  if (status === 0) {
    return { kind: "transient", reason: "offline" };
  }
  if (status >= 500 || status === 408 || status === 429) {
    return { kind: "transient", reason: "server" };
  }
  if (status === 401 || status === 403) {
    return { kind: "auth" };
  }
  if (status === 409 && looksLikeDeviceLock(error)) {
    return { kind: "device" };
  }
  const reason =
    fieldOf(error, "detail") ?? fieldOf(error, "message") ?? `HTTP ${status}`;
  return { kind: "rejected", reason };
}

function isPauseReason(value: unknown): value is PauseReason {
  return value === "offline" || value === "auth" || value === "device";
}

function openChannel(): BroadcastChannel | null {
  const ctor: unknown = (globalThis as { BroadcastChannel?: unknown })
    .BroadcastChannel;
  if (typeof ctor !== "function") {
    return null;
  }
  try {
    return new (ctor as new (name: string) => BroadcastChannel)(CHANNEL_NAME);
  } catch {
    // A browser without channels (or a blocked one) still syncs; only the
    // cross-tab re-render is lost.
    return null;
  }
}

export function createSync(
  outbox: Outbox,
  transport: Transport,
  onChange: (state: SyncState) => void,
): Sync {
  const knownGames = new Set<number>();
  const inFlight = new Map<number, Promise<void>>();
  const channel = openChannel();

  let paused: PauseReason | null =
    globalThis.navigator?.onLine === false ? "offline" : null;
  // A pause the app asked for (`pause()`) is only lifted by `resume()`; the
  // ones the engine detects itself are retried by the backoff and `online`.
  let manualPause = false;
  let syncing = false;
  let last: SyncState = { pending: 0, failed: 0, syncing: false, paused };
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffStep = 0;
  let disposed = false;

  async function totals(): Promise<SyncCounts> {
    let pending = 0;
    let failed = 0;
    for (const gameId of knownGames) {
      const [waiting, rejected] = await Promise.all([
        outbox.pending(gameId),
        outbox.failed(gameId),
      ]);
      pending += waiting.length;
      failed += rejected.length;
    }
    return { pending, failed };
  }

  async function emit(): Promise<void> {
    if (disposed) {
      return;
    }
    try {
      const counts = await totals();
      last = { ...counts, syncing, paused };
    } catch {
      // A status listener must not break a flush; the counts simply stay one
      // step behind until the next emit succeeds.
      last = { ...last, syncing, paused };
    }
    try {
      onChange(last);
    } catch {
      // A throwing subscriber is the subscriber's problem.
    }
  }

  function broadcast(message: SyncMessage): void {
    if (disposed || channel === null) {
      return;
    }
    try {
      channel.postMessage(message);
    } catch {
      // Other tabs are gone or the channel was closed mid-flight.
    }
  }

  function setPaused(reason: PauseReason | null, announce = true): void {
    if (paused === reason) {
      return;
    }
    paused = reason;
    if (announce) {
      broadcast(reason === null ? { type: "resumed" } : { type: "paused", reason });
    }
    void emit();
  }

  function clearBackoff(): void {
    if (backoffTimer !== null) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  }

  function scheduleRetry(gameId: number): void {
    if (disposed || backoffTimer !== null) {
      return;
    }
    backoffStep += 1;
    const delay = Math.min(
      BACKOFF_START_MS * 2 ** (backoffStep - 1),
      BACKOFF_MAX_MS,
    );
    backoffTimer = setTimeout(() => {
      backoffTimer = null;
      if (disposed) {
        return;
      }
      // An offline pause the engine set itself is only a report; a manual one
      // belongs to the app and has to survive the retry.
      if (paused === "offline" && !manualPause) {
        setPaused(null);
      }
      if (paused !== null) {
        return;
      }
      void flush(gameId);
    }, delay);
  }

  async function attempt(op: PendingOp): Promise<Outcome> {
    try {
      await transport.send(op);
    } catch (error) {
      const verdict = classify(error);
      if (verdict.kind === "transient") {
        if (verdict.reason === "offline") {
          setPaused("offline");
        }
        return { kind: "stopped", reason: verdict.reason };
      }
      if (verdict.kind === "auth") {
        setPaused("auth");
        return { kind: "paused" };
      }
      if (verdict.kind === "device") {
        setPaused("device");
        return { kind: "paused" };
      }
      await outbox.markFailed(op.id, verdict.reason);
      broadcast({ type: "changed", gameId: op.gameId });
      return { kind: "rejected" };
    }
    // A duplicate `client_id` is answered with `200` and the current log, so a
    // replayed op resolves like a fresh one and is removed here.
    await outbox.remove(op.id);
    broadcast({ type: "changed", gameId: op.gameId });
    return { kind: "sent" };
  }

  async function drain(gameId: number): Promise<void> {
    if (disposed) {
      return;
    }
    syncing = true;
    // The flush is running, so whatever the timer was going to do is moot.
    clearBackoff();
    await emit();
    let stopped: "offline" | "server" | null = null;
    try {
      while (!disposed && paused === null) {
        const op = await outbox.peek(gameId);
        if (op === undefined) {
          break;
        }
        const outcome = await attempt(op);
        if (outcome.kind === "sent") {
          backoffStep = 0;
        } else if (outcome.kind === "stopped") {
          stopped = outcome.reason;
          break;
        } else if (outcome.kind === "paused") {
          break;
        }
        await emit();
      }
    } finally {
      syncing = false;
      await emit();
    }
    if (stopped !== null) {
      scheduleRetry(gameId);
    }
  }

  async function withLock(
    gameId: number,
    run: () => Promise<void>,
  ): Promise<void> {
    const locks = globalThis.navigator?.locks;
    if (locks === undefined || typeof locks.request !== "function") {
      await run();
      return;
    }
    let acquired = false;
    let failure: unknown = null;
    try {
      await locks.request(
        `${LOCK_PREFIX}${gameId}`,
        { ifAvailable: true },
        async (lock) => {
          if (lock === null) {
            // Another tab owns this game's drain. It will broadcast.
            return;
          }
          acquired = true;
          await run();
        },
      );
    } catch (error) {
      failure = error;
    }
    if (failure === null) {
      return;
    }
    if (acquired) {
      // The drain itself failed; running it again would replay everything.
      return;
    }
    // The lock machinery broke, not the queue: a replay is idempotent, a stuck
    // queue is not.
    await run();
  }

  async function flush(gameId: number): Promise<void> {
    knownGames.add(gameId);
    if (disposed) {
      return;
    }
    if (paused !== null) {
      // Report the blocked queue instead of silently doing nothing, so a badge
      // that was mounted after the pause still shows the right count.
      await emit();
      return;
    }
    const running = inFlight.get(gameId);
    if (running !== undefined) {
      return running;
    }
    const run = (async () => {
      try {
        await withLock(gameId, () => drain(gameId));
      } catch {
        // IndexedDB is gone or the drain threw; the rows stay queued and the
        // next `online`/`flush` picks them up.
      } finally {
        inFlight.delete(gameId);
      }
    })();
    inFlight.set(gameId, run);
    await run;
  }

  async function flushAll(): Promise<void> {
    await Promise.all([...knownGames].map((gameId) => flush(gameId)));
  }

  function onOnline(): void {
    if (disposed) {
      return;
    }
    retryNow();
  }

  function onOffline(): void {
    if (disposed) {
      return;
    }
    // Never downgrade an auth/device pause: that explanation is still true.
    if (paused === null || paused === "offline") {
      setPaused("offline");
    }
  }

  function onVisible(): void {
    if (disposed || globalThis.document?.visibilityState !== "visible") {
      return;
    }
    retryNow();
  }

  /**
   * The network may be back (an `online` event, or a throttled background tab
   * being shown): drop the engine's own offline pause, forget the backoff and
   * try every game now.
   */
  function retryNow(): void {
    if (paused === "offline" && !manualPause) {
      setPaused(null);
    }
    backoffStep = 0;
    clearBackoff();
    void flushAll();
  }

  function onMessage(data: unknown): void {
    if (disposed || typeof data !== "object" || data === null) {
      return;
    }
    const message = data as Partial<SyncMessage>;
    if (message.type === "changed" && typeof message.gameId === "number") {
      knownGames.add(message.gameId);
      void emit();
      return;
    }
    if (message.type === "paused" && isPauseReason(message.reason)) {
      setPaused(message.reason, false);
      return;
    }
    if (message.type === "resumed") {
      // Another tab's app resumed (re-login, staff unlock): the queue is shared,
      // so the local pause --- including a manual one --- goes with it.
      manualPause = false;
      setPaused(null, false);
    }
  }

  if (channel !== null) {
    channel.onmessage = (event: MessageEvent) => {
      onMessage(event.data);
    };
  }
  const listens = typeof globalThis.addEventListener === "function";
  if (listens) {
    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("offline", onOffline);
  }
  const document_ = globalThis.document;
  const watchesVisibility =
    typeof document_?.addEventListener === "function";
  if (watchesVisibility) {
    document_.addEventListener("visibilitychange", onVisible);
  }

  return {
    flush,

    flushAll,

    async counts(gameId: number): Promise<SyncCounts> {
      const [waiting, rejected] = await Promise.all([
        outbox.pending(gameId),
        outbox.failed(gameId),
      ]);
      return { pending: waiting.length, failed: rejected.length };
    },

    state(): SyncState {
      return { ...last, syncing, paused };
    },

    pause(reason: PauseReason = "offline"): void {
      manualPause = true;
      backoffStep = 0;
      clearBackoff();
      setPaused(reason);
    },

    async resume(): Promise<void> {
      manualPause = false;
      backoffStep = 0;
      clearBackoff();
      setPaused(null);
      await flushAll();
    },

    dispose(): void {
      disposed = true;
      clearBackoff();
      if (listens) {
        globalThis.removeEventListener("online", onOnline);
        globalThis.removeEventListener("offline", onOffline);
      }
      if (watchesVisibility) {
        document_.removeEventListener("visibilitychange", onVisible);
      }
      if (channel !== null) {
        channel.onmessage = null;
        try {
          channel.close();
        } catch {
          // Already closed.
        }
      }
    },
  };
}
