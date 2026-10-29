/**
 * The vocabulary shared by the offline store (Task 18), the sync engine
 * (Task 19) and the UI (Task 20/21).
 *
 * A queued op is one user action, not one HTTP call: the transport translates
 * `kind` + `payload` into an endpoint, so the queue itself stays free of API
 * details. `id` is also the `client_id` the server dedupes a log write on,
 * which is why it has to exist *before* the first attempt.
 */

export type OpKind =
  | "event"
  | "possession"
  | "halftime"
  | "correction"
  /** The pre-slice-2 undo, only for rows a game's own events did not write. */
  | "delete";

export interface PendingOp {
  /** UUID; travels as `client_id` so a replay is applied at most once. */
  id: string;
  gameId: number;
  kind: OpKind;
  /** Endpoint-specific body. Opaque to the queue. */
  payload: unknown;
  /**
   * Wall-clock time of the tap. The queue orders by its own monotonic `seq`;
   * this is only the fallback for rows written before `seq` existed.
   */
  createdAt: number;
  /**
   * Send attempts: stamped by the enqueuer and incremented by the outbox on
   * every failure, so a rejected op carries how often it was tried.
   */
  attempts: number;
  /**
   * The `X-Scorecard-Device` value captured when the op was queued, so a
   * flush keeps the lock the op was admitted under even after the UI moved on
   * to another game. `null`/absent sends no header (the old app's behaviour).
   */
  deviceId?: string | null;
}

/**
 * A queue row as it is stored: {@link PendingOp} plus rejection bookkeeping.
 *
 * A failed op leaves the FIFO (it must not block the ops behind it) but stays
 * in the store until it is retried or dropped, so a rejected payload cannot
 * vanish silently between two flushes.
 */
export interface StoredOp extends PendingOp {
  /**
   * Monotonic per-game insertion order, stamped inside `enqueue`'s write
   * transaction. Rows written before this field existed fall back to
   * `createdAt`.
   */
  seq: number;
  failed: boolean;
  failedReason: string | null;
  failedAt: number | null;
}
