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
 *   same game. When a browser has no lock manager, a module-level guard shared
 *   by every engine in the tab takes over. The server's `client_id` dedupe is
 *   the last line of defence.
 * - **No spinning.** A stopped flush schedules a capped exponential retry per
 *   game (1 s → 30 s); a `429` with `Retry-After` wins over the backoff. `online`
 *   and a visible tab reset the backoff and retry now.
 * - **Tabs cooperate.** A `BroadcastChannel` tells the other tabs to re-read
 *   the queue (they never share memory, only the IndexedDB rows) and carries a
 *   manual pause, so another tab's `visibilitychange` cannot lift it.
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
  /**
   * Drain one game. Resolves when the flush stopped, never rejects.
   *
   * "Resolves" is not "drained": if another tab holds the game's lock this
   * returns immediately without sending anything — that tab drains and
   * broadcasts `changed`. A caller that needs the final queue state (the
   * finalise guard) must read {@link Sync.counts}, not trust this promise.
   */
  flush(gameId: number): Promise<void>;
  /** Drain every game this engine has seen (used by `online`). */
  flushAll(): Promise<void>;
  /**
   * The queue of one game, read from IndexedDB — unlike {@link Sync.state} it
   * is correct after a reload. The finalise guard in Task 20 consumes this.
   */
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
  | { type: "paused"; reason: PauseReason; manual?: boolean }
  | { type: "resumed" };

type Verdict =
  | {
      kind: "transient";
      reason: "offline" | "server";
      retryAfterMs?: number;
    }
  | { kind: "auth" }
  | { kind: "device" }
  | { kind: "rejected"; reason: string };

type Outcome =
  | { kind: "sent" }
  | { kind: "rejected" }
  | { kind: "stopped"; reason: "offline" | "server"; retryAfterMs?: number }
  | { kind: "paused" };

/**
 * Last-resort single-drainer guard for browsers without `navigator.locks`.
 * Module-level on purpose: two engines constructed in the same tab (a
 * remount, a test harness) still must not send one game's ops twice.
 */
const sharedInFlight = new Map<number, Promise<void>>();

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

/**
 * DRF rejects a bad payload with `{"field": ["message"]}` (and nested
 * serializers with `{"field": {"sub": ["message"]}}`). The first message is the
 * one worth showing; the field name alone is not.
 */
function firstErrorString(value: unknown, depth = 0): string | null {
  if (typeof value === "string") {
    return value.trim() === "" ? null : value;
  }
  if (depth > 3) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstErrorString(entry, depth + 1);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = firstErrorString(entry, depth + 1);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

function bodyOf(error: unknown): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  return (error as { body?: unknown }).body;
}

function readHeader(headers: unknown, name: string): unknown {
  if (typeof headers !== "object" || headers === null) {
    return undefined;
  }
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    try {
      return (getter as (key: string) => unknown).call(headers, name);
    } catch {
      return undefined;
    }
  }
  for (const [key, value] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    if (key.toLowerCase() === name) {
      return value;
    }
  }
  return undefined;
}

/**
 * `Retry-After` is seconds or an HTTP date; our transport-side errors may also
 * carry an already-computed `retryAfterMs`. Anything unparsable falls back to
 * the exponential backoff.
 */
function retryAfterMsOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const holder = error as {
    retryAfterMs?: unknown;
    retryAfter?: unknown;
    headers?: unknown;
  };
  if (
    typeof holder.retryAfterMs === "number" &&
    Number.isFinite(holder.retryAfterMs)
  ) {
    return Math.max(holder.retryAfterMs, 0);
  }
  const header = holder.retryAfter ?? readHeader(holder.headers, "retry-after");
  if (typeof header === "number" && Number.isFinite(header)) {
    return Math.max(header * 1_000, 0);
  }
  if (typeof header === "string" && header.trim() !== "") {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1_000, 0);
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(date - Date.now(), 0);
    }
  }
  return undefined;
}

/**
 * The server marks a device conflict in the body (`device_id`) rather than a
 * flag; the German detail text is only the fallback for an older answer.
 */
function looksLikeDeviceLock(error: unknown): boolean {
  const body = bodyOf(error);
  if (typeof body === "object" && body !== null && "device_id" in body) {
    return true;
  }
  const bodyDetail =
    typeof body === "object" && body !== null
      ? fieldOf(body, "detail")
      : null;
  const detail =
    fieldOf(error, "detail") ?? bodyDetail ?? fieldOf(error, "message");
  return detail !== null && detail.includes(DEVICE_LOCK_DETAIL);
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
  if (status === 429) {
    return {
      kind: "transient",
      reason: "server",
      retryAfterMs: retryAfterMsOf(error),
    };
  }
  if (status >= 500 || status === 408) {
    return { kind: "transient", reason: "server" };
  }
  if (status === 401 || status === 403) {
    return { kind: "auth" };
  }
  if (status === 409 && looksLikeDeviceLock(error)) {
    return { kind: "device" };
  }
  const reason =
    fieldOf(error, "detail") ??
    firstErrorString(bodyOf(error)) ??
    fieldOf(error, "message") ??
    `HTTP ${status}`;
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
  // It is sticky across tabs: a manual pause carries `manual: true` on the
  // channel so another tab's visibility retry cannot lift it.
  let manualPause = false;
  // Counted, not a flag: two games (or two `flushAll` callers) can be in
  // flight at once and the state must stay "syncing" until the last one ends.
  let activeFlushes = 0;
  let last: SyncState = { pending: 0, failed: 0, syncing: false, paused };
  // One retry timer per game: game 1 backing off after a 503 must not be
  // cancelled by a successful flush of game 2.
  const retries = new Map<
    number,
    { timer: ReturnType<typeof setTimeout> | null; step: number }
  >();
  let disposed = false;

  function isSyncing(): boolean {
    return activeFlushes > 0;
  }

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
      last = { ...counts, syncing: isSyncing(), paused };
    } catch {
      // A status listener must not break a flush; the counts simply stay one
      // step behind until the next emit succeeds.
      last = { ...last, syncing: isSyncing(), paused };
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
      broadcast(
        reason === null
          ? { type: "resumed" }
          : { type: "paused", reason, manual: manualPause },
      );
    }
    void emit();
  }

  /** Drop one game's timer but keep its backoff step. */
  function clearRetryTimer(gameId: number): void {
    const entry = retries.get(gameId);
    if (entry !== undefined && entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  /** Drop every timer and every backoff step (`online`, `resume`, `dispose`). */
  function clearRetries(): void {
    for (const entry of retries.values()) {
      if (entry.timer !== null) {
        clearTimeout(entry.timer);
      }
    }
    retries.clear();
  }

  function scheduleRetry(
    gameId: number,
    retryAfterMs?: number,
  ): void {
    if (disposed) {
      return;
    }
    const entry = retries.get(gameId);
    if (entry !== undefined && entry.timer !== null) {
      return;
    }
    const step = (entry?.step ?? 0) + 1;
    const backoff = Math.min(
      BACKOFF_START_MS * 2 ** (step - 1),
      BACKOFF_MAX_MS,
    );
    // A server telling us when to come back (`429` + `Retry-After`) beats our
    // own guess, but never waits longer than the cap.
    const delay =
      retryAfterMs !== undefined
        ? Math.min(Math.max(retryAfterMs, 0), BACKOFF_MAX_MS)
        : backoff;
    const timer = setTimeout(() => {
      const current = retries.get(gameId);
      if (current !== undefined) {
        current.timer = null;
      }
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
    retries.set(gameId, { timer, step });
  }

  async function attempt(op: PendingOp): Promise<Outcome> {
    try {
      await transport.send(op);
    } catch (error) {
      // Undoing something that is already gone is a successful replay: the
      // server answers 404 once another tab (or an earlier attempt whose
      // answer was lost) deleted the row or the game.
      if (op.kind === "delete" && statusOf(error) === 404) {
        await outbox.remove(op.id);
        broadcast({ type: "changed", gameId: op.gameId });
        return { kind: "sent" };
      }
      const verdict = classify(error);
      if (verdict.kind === "transient") {
        if (verdict.reason === "offline") {
          setPaused("offline");
        }
        return {
          kind: "stopped",
          reason: verdict.reason,
          retryAfterMs: verdict.retryAfterMs,
        };
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
    // Only this game's pending timer is moot; another game may still be
    // backing off.
    clearRetryTimer(gameId);
    let stopped: { reason: "offline" | "server"; retryAfterMs?: number } | null =
      null;
    while (!disposed && paused === null) {
      const op = await outbox.peek(gameId);
      if (op === undefined) {
        break;
      }
      const outcome = await attempt(op);
      if (outcome.kind === "sent") {
        retries.delete(gameId);
      } else if (outcome.kind === "stopped") {
        stopped = {
          reason: outcome.reason,
          retryAfterMs: outcome.retryAfterMs,
        };
        break;
      } else if (outcome.kind === "paused") {
        break;
      }
      await emit();
    }
    if (stopped !== null) {
      scheduleRetry(gameId, stopped.retryAfterMs);
    }
  }

  async function withLock(
    gameId: number,
    run: () => Promise<void>,
  ): Promise<void> {
    const locks = globalThis.navigator?.locks;
    if (locks === undefined || typeof locks.request !== "function") {
      // No lock manager: fall back to the tab-wide guard so two engines in one
      // tab still cannot send the same game twice.
      const running = sharedInFlight.get(gameId);
      if (running !== undefined) {
        return running;
      }
      const guarded = run().finally(() => {
        sharedInFlight.delete(gameId);
      });
      sharedInFlight.set(gameId, guarded);
      return guarded;
    }
    let acquired = false;
    let failure: unknown = null;
    try {
      await locks.request(
        `${LOCK_PREFIX}${gameId}`,
        { ifAvailable: true },
        async (lock) => {
          if (lock === null) {
            // Another tab owns this game's drain. It will broadcast, and this
            // flush resolves immediately (see `Sync.flush`).
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
      activeFlushes += 1;
      await emit();
      try {
        await withLock(gameId, () => drain(gameId));
      } catch {
        // IndexedDB is gone or the drain threw; the rows stay queued and the
        // next `online`/`flush` picks them up.
      } finally {
        activeFlushes -= 1;
        inFlight.delete(gameId);
        await emit();
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
    clearRetries();
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
      // A pause the user asked for belongs to the whole app, not one tab: keep
      // it manual here too, or this tab's visibility retry would lift it and
      // broadcast `resumed` back.
      if (message.manual === true) {
        manualPause = true;
      }
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

  // A reload has no memory of the games it drained, but IndexedDB does: without
  // this, `state().pending` would read 0 until the app flushed a game. Failure
  // is fine — the first `flush` registers the game anyway.
  void outbox
    .gameIds()
    .then((gameIds) => {
      if (disposed || gameIds.length === 0) {
        return;
      }
      for (const gameId of gameIds) {
        knownGames.add(gameId);
      }
      return emit();
    })
    .catch(() => undefined);

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
      return { ...last, syncing: isSyncing(), paused };
    },

    pause(reason: PauseReason = "offline"): void {
      manualPause = true;
      clearRetries();
      setPaused(reason);
    },

    async resume(): Promise<void> {
      manualPause = false;
      clearRetries();
      setPaused(null);
      await flushAll();
    },

    dispose(): void {
      disposed = true;
      clearRetries();
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
