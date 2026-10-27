/**
 * The sync badge: what the outbox is doing, and the way out of a pause.
 *
 * States, exactly as the offline contract names them:
 *
 * - `Synchron` — nothing queued.
 * - `N warten` / `N warten · M abgelehnt` — writes are queued, and M of them
 *   were rejected. The badge is actionable in both cases.
 * - `Offline · N` — no network; the queue survives.
 * - `Pausiert · <reason>` — the server said no (expired session, another
 *   device holds the game). Tapping lifts the pause and retries.
 *
 * A rejected write is visible below the badge as "1 Eintrag abgelehnt" with a
 * retry and a drop, so a bad payload cannot disappear quietly between two
 * flushes. A queue blocked by an expired session lists its ops with
 * "Verwerfen": without that, a game whose session died on a shared device
 * could never be finalised.
 */
import { useSyncStatus } from "../session/useSyncStatus";
import { getRuntime } from "../session/runtime";
import type { PauseReason } from "../offline/sync";
import type { StoredOp } from "../offline/types";

interface SyncBadgeProps {
  /** The open game. Without one the engine-wide total is shown. */
  gameId?: number | null;
}

interface LabelState {
  paused: PauseReason | null;
  pending: number;
  failed: number;
  online: boolean;
}

/** The badge text. Exported so the states are tested without a DOM. */
export function syncLabel({
  paused,
  pending,
  failed,
  online,
}: LabelState): string {
  if (paused === "device") {
    return "Pausiert · anderes Gerät";
  }
  if (paused === "auth") {
    return "Pausiert · Anmeldung";
  }
  if (paused === "offline" || !online) {
    return pending > 0 ? `Offline · ${pending}` : "Offline";
  }
  const waiting = pending > 0 ? `${pending} warten` : null;
  const rejected = failed > 0 ? `${failed} abgelehnt` : null;
  const parts = [waiting, rejected].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? "Synchron" : parts.join(" · ");
}

/** What the pause means for the official, in one sentence. */
export function pauseReason(paused: PauseReason | null): string | null {
  if (paused === "device") {
    return "Das Spiel läuft auf einem anderen Gerät. Dieses Gerät ist nur lesend.";
  }
  if (paused === "auth") {
    return "Die Anmeldung ist abgelaufen. Bitte neu anmelden, dann wird gesendet.";
  }
  return null;
}

export function failedLabel(count: number): string {
  return count === 1 ? "1 Eintrag abgelehnt" : `${count} Einträge abgelehnt`;
}

const OP_LABEL: Record<StoredOp["kind"], string> = {
  event: "Eintrag",
  delete: "Rückgängig",
  possession: "Ballbesitz",
  halftime: "Halbzeit",
};

export default function SyncBadge({ gameId = null }: SyncBadgeProps) {
  const status = useSyncStatus(gameId);
  const label = syncLabel(status);
  const reason = pauseReason(status.paused);
  const actionable =
    status.paused !== null || status.pending > 0 || status.failed > 0;
  // A paused queue has no retry timer of its own: the op can only go if the
  // official drops it, or once the session is back. Without this list a game
  // whose session expired on a shared device could never be finalised.
  const droppable = status.paused === "auth" ? status.pendingOps : [];

  const retryNow = (): void => {
    if (status.paused !== null) {
      void status.resume();
      return;
    }
    void getRuntime().sync.flushAll();
  };

  return (
    <section aria-label="Übertragung" className="syncbar">
      {actionable ? (
        <button
          className={`syncbadge ${
            status.paused !== null || !status.online
              ? "syncbadge-off"
              : "syncbadge-wait"
          }`}
          onClick={retryNow}
          type="button"
        >
          <span aria-hidden="true" className="syncdot" />
          {label}
        </button>
      ) : (
        <span className="syncbadge syncbadge-ok">
          <span aria-hidden="true" className="syncdot" />
          {label}
        </span>
      )}

      {reason === null ? null : <p className="syncwhy">{reason}</p>}

      {droppable.length > 0 ? (
        <div className="syncfailed">
          <p className="syncfailed-head">
            {droppable.length === 1
              ? "1 Eintrag wartet auf die Anmeldung"
              : `${droppable.length} Einträge warten auf die Anmeldung`}
          </p>
          <ul className="syncfailed-list">
            {droppable.map((op) => (
              <li className="syncfailed-row" key={op.id}>
                <span className="syncfailed-op">{OP_LABEL[op.kind]}</span>
                <span className="syncfailed-reason">
                  Wird erst nach der Anmeldung gesendet
                </span>
                <span className="syncfailed-actions">
                  <button
                    className="synclink"
                    onClick={() => void status.drop(op.id)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status.failed > 0 ? (
        <div className="syncfailed">
          <p className="syncfailed-head">{failedLabel(status.failed)}</p>
          <ul className="syncfailed-list">
            {status.failedOps.map((op) => (
              <li className="syncfailed-row" key={op.id}>
                <span className="syncfailed-op">{OP_LABEL[op.kind]}</span>
                <span className="syncfailed-reason">
                  {op.failedReason ?? "Unbekannter Fehler"}
                </span>
                <span className="syncfailed-actions">
                  <button
                    className="synclink"
                    onClick={() => void status.retry(op.id)}
                    type="button"
                  >
                    Erneut versuchen
                  </button>
                  <button
                    className="synclink"
                    onClick={() => void status.drop(op.id)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
