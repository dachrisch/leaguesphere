/**
 * The sync badge: what the outbox is doing, and the way out of a pause.
 *
 * States, exactly as the offline contract names them:
 *
 * - `Synchron` — nothing queued.
 * - `N warten` — N writes are queued and will be sent.
 * - `Offline · N` — no network; the queue survives.
 * - `Pausiert · <reason>` — the server said no (expired session, another
 *   device holds the game). Tapping lifts the pause and retries.
 *
 * A rejected write is visible below the badge as "1 Eintrag abgelehnt" with a
 * retry and a drop, so a bad payload cannot disappear quietly between two
 * flushes.
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
  online: boolean;
}

/** The badge text. Exported so the states are tested without a DOM. */
export function syncLabel({ paused, pending, online }: LabelState): string {
  if (paused === "device") {
    return "Pausiert · anderes Gerät";
  }
  if (paused === "auth") {
    return "Pausiert · Anmeldung";
  }
  if (paused === "offline" || !online) {
    return pending > 0 ? `Offline · ${pending}` : "Offline";
  }
  return pending > 0 ? `${pending} warten` : "Synchron";
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
  const actionable = status.paused !== null || status.pending > 0;

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
