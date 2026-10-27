/**
 * The per-game write queue.
 *
 * Everything an official taps while the network is gone lands here first and is
 * drained by the sync engine (Task 19). The queue is plain IndexedDB behind an
 * {@link Outbox} interface: no React, no module-level data cache, so a second
 * tab and a reloaded page see exactly the same rows.
 *
 * Ordering is FIFO within one game by a monotonic `seq` that `enqueue` stamps
 * inside its write transaction, so two actions in the same millisecond keep the
 * order the official tapped them. `createdAt` is only the fallback for rows
 * written before `seq` existed. Games never interleave — draining game 1 must
 * not reorder game 2. Failed ops are flagged, not deleted: they leave the FIFO
 * so a rejected payload cannot block the ops behind it, but the UI can still
 * show, retry or drop them.
 */
import {
  GAME_INDEX,
  OPS_STORE,
  openOutboxDatabase,
  type DatabaseFactory,
  type OutboxDatabase,
} from "./db";
import type { PendingOp, StoredOp } from "./types";

export interface Outbox {
  /** Rejects with {@link DuplicateOpError} when `op.id` is already queued. */
  enqueue(op: PendingOp): Promise<void>;
  /** Pending (non-failed) ops of one game, FIFO. */
  pending(gameId: number): Promise<StoredOp[]>;
  /** The next op a flush would send, or `undefined` when the game is drained. */
  peek(gameId: number): Promise<StoredOp | undefined>;
  /** One row by id, failed or pending, or `undefined` when it is gone. */
  get(id: string): Promise<StoredOp | undefined>;
  /** Every game that has a row, pending or failed (for a reload's state). */
  gameIds(): Promise<number[]>;
  remove(id: string): Promise<void>;
  /** Take the op out of the FIFO and keep it for the UI, with a reason. */
  markFailed(id: string, reason: string): Promise<void>;
  /** Rejected ops of one game, oldest first. */
  failed(gameId: number): Promise<StoredOp[]>;
  /** Put a failed op back into the FIFO, at its original position. */
  retry(id: string): Promise<void>;
  /** Drop every op of one game, pending and failed. */
  clear(gameId: number): Promise<void>;
  /** Drop the whole queue, every game (logout on a shared device). */
  clearAll(): Promise<void>;
}

/**
 * The op id is the object store's key, so enqueueing it twice would silently
 * replace the first row (or, worse, rewrite an op that is in flight). Callers
 * generate a UUID per action; a collision is a bug worth surfacing.
 */
export class DuplicateOpError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Der Eintrag ${id} liegt bereits in der Warteschlange.`);
    this.name = "DuplicateOpError";
    this.id = id;
  }
}

function queueOrder(a: StoredOp, b: StoredOp): number {
  // `seq` is what `enqueue` stamps; `createdAt` only orders rows that predate
  // it (or a caller that wrote the store by hand).
  const seqA = typeof a.seq === "number" ? a.seq : undefined;
  const seqB = typeof b.seq === "number" ? b.seq : undefined;
  if (seqA !== undefined && seqB !== undefined && seqA !== seqB) {
    return seqA - seqB;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { name } = error as { name?: unknown };
    if (typeof name === "string") {
      return name;
    }
  }
  return "";
}

export function createOutbox(open: DatabaseFactory = openOutboxDatabase): Outbox {
  // One connection per outbox instance, opened on first use: constructing an
  // outbox must not touch IndexedDB (the app builds it during boot, sometimes
  // before the browser has a profile directory). A failed open is not cached,
  // so a retry after a permission error can still succeed.
  let connection: Promise<OutboxDatabase> | null = null;

  function database(): Promise<OutboxDatabase> {
    if (connection === null) {
      connection = open().catch((error: unknown) => {
        connection = null;
        throw error;
      });
    }
    return connection;
  }

  async function rows(gameId: number): Promise<StoredOp[]> {
    const db = await database();
    return db.transaction(OPS_STORE).store.index(GAME_INDEX).getAll(gameId);
  }

  async function update(
    id: string,
    change: Partial<StoredOp> | ((record: StoredOp) => Partial<StoredOp>),
  ): Promise<StoredOp | undefined> {
    const db = await database();
    const tx = db.transaction(OPS_STORE, "readwrite");
    const record = await tx.store.get(id);
    if (record === undefined) {
      await tx.done;
      return undefined;
    }
    const patch = typeof change === "function" ? change(record) : change;
    // One `put` for the whole change: the attempt count and the failure stamp
    // land in the same atomic write.
    const next: StoredOp = { ...record, ...patch };
    await tx.store.put(next);
    await tx.done;
    return next;
  }

  return {
    async enqueue(op: PendingOp): Promise<void> {
      const db = await database();
      const tx = db.transaction(OPS_STORE, "readwrite");
      try {
        // The read and the write share one readwrite transaction, and
        // IndexedDB serialises transactions on the store, so two tabs (or two
        // same-millisecond taps) can never stamp the same `seq`.
        const existing = await tx.store.index(GAME_INDEX).getAll(op.gameId);
        const highest = existing.reduce(
          (max, row) =>
            typeof row.seq === "number" && row.seq > max ? row.seq : max,
          0,
        );
        const record: StoredOp = {
          ...op,
          // A JS caller may omit them even though the type says otherwise.
          attempts: op.attempts ?? 0,
          deviceId: op.deviceId ?? null,
          seq: highest + 1,
          failed: false,
          failedReason: null,
          failedAt: null,
        };
        // `add`, not `put`: IndexedDB rejects an existing key, which turns the
        // duplicate check into part of the same atomic write.
        await tx.store.add(record);
        await tx.done;
      } catch (error) {
        // The aborted transaction rejects on its own; without a handler that
        // would surface as an unhandled rejection next to the useful error.
        await tx.done.catch(() => undefined);
        if (errorName(error) === "ConstraintError") {
          throw new DuplicateOpError(op.id);
        }
        throw error;
      }
    },

    async pending(gameId: number): Promise<StoredOp[]> {
      return (await rows(gameId)).filter((row) => !row.failed).sort(queueOrder);
    },

    async peek(gameId: number): Promise<StoredOp | undefined> {
      return (await rows(gameId)).filter((row) => !row.failed).sort(queueOrder)[0];
    },

    async get(id: string): Promise<StoredOp | undefined> {
      const db = await database();
      return db.get(OPS_STORE, id);
    },

    async gameIds(): Promise<number[]> {
      const db = await database();
      // `IDBIndex.getAllKeys` returns the *primary* keys (the op ids), so the
      // game ids come from the rows themselves.
      const rows_ = await db.transaction(OPS_STORE).store.getAll();
      const ids = new Set<number>();
      for (const row of rows_) {
        if (Number.isFinite(row.gameId)) {
          ids.add(row.gameId);
        }
      }
      return [...ids];
    },

    async remove(id: string): Promise<void> {
      const db = await database();
      await db.delete(OPS_STORE, id);
    },

    async markFailed(id: string, reason: string): Promise<void> {
      await update(id, (record) => ({
        failed: true,
        failedReason: reason,
        failedAt: Date.now(),
        attempts: (record.attempts ?? 0) + 1,
      }));
    },

    async failed(gameId: number): Promise<StoredOp[]> {
      return (await rows(gameId)).filter((row) => row.failed).sort(queueOrder);
    },

    async retry(id: string): Promise<void> {
      await update(id, { failed: false, failedReason: null, failedAt: null });
    },

    async clear(gameId: number): Promise<void> {
      const db = await database();
      const keys = await db
        .transaction(OPS_STORE)
        .store.index(GAME_INDEX)
        .getAllKeys(gameId);
      if (keys.length === 0) {
        return;
      }
      // Keys first, then one write transaction: keeping the read and the
      // deletes in a single transaction would auto-commit between the two
      // awaits on engines that end a transaction as soon as it goes idle.
      const tx = db.transaction(OPS_STORE, "readwrite");
      await Promise.all(keys.map((key) => tx.store.delete(key)));
      await tx.done;
    },

    async clearAll(): Promise<void> {
      // Logout, not a repair: the whole store goes in one transaction, so a
      // shared device cannot keep a previous official's events behind.
      const db = await database();
      await db.clear(OPS_STORE);
    },
  };
}
