/**
 * Translates one queued op into the HTTP call the server expects.
 *
 * Since slice 2 there is one write: the app **appends events**
 * (`POST /api/game/<id>/events`). Possession, the half-time marker and undo are
 * events like a touchdown -- the difference is only their envelope -- so they
 * queue and replay exactly like a play, offline included. For a legacy row
 * (a game the old app wrote, whose rows carry no event `seq`) the undo still
 * uses `DELETE /api/gamelog/<id>`; that is the one remaining non-event write
 * and it disappears when the old app is sunset.
 *
 * The append endpoint answers `{state, cursor}`, not the log, so `send` reads
 * the log afterwards and returns it. The queue therefore keeps its contract --
 * "the server payload always wins" -- and the screen adopts the same payload it
 * always did. A lost read is reported as "not delivered": the op stays queued
 * with its `client_id`, the replay is a no-op POST answered with the log, and
 * the screen never shows the play twice.
 *
 * Publishing is deliberately two-phase: {@link Transport.send} returns the
 * answer, and the engine calls {@link Transport.landed} once the op has left
 * the queue — publishing inside `send` would let the screen replay the
 * still-queued op on top of the server's own numbers.
 */
import { ApiError, apiDelete, apiGet, apiPost } from "../api/client";
import type { GameLog } from "../api/types";
import type { Transport } from "../offline/sync";
import type { PendingOp } from "../offline/types";

export function logPath(gameId: number): string {
  return `/api/gamelog/${gameId}`;
}

export function eventsPath(gameId: number): string {
  return `/api/game/${gameId}/events`;
}

function isGameLog(value: unknown): value is GameLog {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<GameLog>;
  return (
    typeof candidate.gameId === "number" &&
    typeof candidate.home === "object" &&
    typeof candidate.away === "object"
  );
}

/** The header override of an op; `null` means "send none" (old app). */
function deviceOption(op: PendingOp): { deviceId: string | null } | undefined {
  return op.deviceId === undefined ? undefined : { deviceId: op.deviceId };
}

/**
 * Append one queued op and read back the log it produced.
 *
 * `client_id` is the op id: a replay after a lost answer is applied at most
 * once and answered with the current state, and the read after it returns the
 * same log the first attempt would have.
 */
export async function appendEvents(
  gameId: number,
  events: unknown[],
  clientId: string,
  options?: { deviceId?: string | null },
): Promise<GameLog> {
  await apiPost(eventsPath(gameId), { events, client_id: clientId }, options);
  return apiGet<GameLog>(logPath(gameId), options);
}

export function createTransport(
  onLog: (gameId: number, log: GameLog, landedOpId?: string) => void,
): Transport {
  return {
    async send(op: PendingOp): Promise<unknown> {
      const options = deviceOption(op);

      if (op.kind === "delete") {
        // Legacy rows only (no event `seq`): the pre-slice-2 per-row undo.
        return apiDelete<GameLog>(logPath(op.gameId), op.payload, options);
      }

      const payload = op.payload as { events?: unknown[] };
      const events = payload?.events;
      if (!Array.isArray(events)) {
        // A row from a build before slice 2 whose payload cannot be translated
        // any more. Fail it visibly (retry/drop in the badge) instead of
        // retrying forever or dropping a tap silently.
        throw new ApiError(
          422,
          { detail: "Dieser Eintrag stammt aus einer älteren App-Version." },
          "Dieser Eintrag stammt aus einer älteren App-Version.",
        );
      }

      return appendEvents(op.gameId, events, op.id, options);
    },

    landed(op: PendingOp, result: unknown): void {
      if (isGameLog(result)) {
        // The op id lets the open screen drop the row it still has in memory;
        // the queue entry itself is already gone.
        onLog(op.gameId, result, op.id);
      }
    },
  };
}
