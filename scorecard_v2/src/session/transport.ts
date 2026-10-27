/**
 * Translates one queued op into the HTTP call the server expects.
 *
 * The queue stores `kind` + `payload` (see offline/types.ts); this module is
 * the only place that knows the endpoints, so the outbox itself stays free of
 * API details. It also publishes the server's answer, because a log write
 * returns the whole log and the screen has to adopt it ("the server payload
 * always wins").
 */
import { ApiError, apiDelete, apiPost, apiPut } from "../api/client";
import type { GameLog } from "../api/types";
import type { Transport } from "../offline/sync";
import type { PendingOp } from "../offline/types";

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
 * A halftime replayed after its first attempt was applied answers `409`
 * "keine Halbzeit" — the half is already running, which is what the op wanted.
 * Treating it as a rejection would leave a red entry the official cannot fix.
 */
function isAppliedHalftime(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return false;
  }
  const detail = `${error.detail ?? ""}`.toLowerCase();
  return detail.includes("keine halbzeit");
}

export function createTransport(
  onLog: (gameId: number, log: GameLog) => void,
): Transport {
  return {
    async send(op: PendingOp): Promise<void> {
      const options = deviceOption(op);
      const path = `/api/gamelog/${op.gameId}`;

      if (op.kind === "event") {
        // `client_id` is the op id: a replay after a lost answer is applied at
        // most once and answered with the current log.
        const body = { ...(op.payload as object), client_id: op.id };
        const log = await apiPost<GameLog>(path, body, options);
        if (isGameLog(log)) {
          onLog(op.gameId, log);
        }
        return;
      }

      if (op.kind === "delete") {
        const log = await apiDelete<GameLog>(path, op.payload, options);
        if (isGameLog(log)) {
          onLog(op.gameId, log);
        }
        return;
      }

      if (op.kind === "possession") {
        await apiPut<void>(
          `/api/game/${op.gameId}/possession`,
          op.payload,
          options,
        );
        return;
      }

      try {
        await apiPut<void>(`/api/game/${op.gameId}/halftime`, {}, options);
      } catch (error) {
        if (isAppliedHalftime(error)) {
          return;
        }
        throw error;
      }
    },
  };
}
