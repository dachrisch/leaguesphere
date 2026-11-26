import { useState } from "react";

import type { GameLog } from "../../api/types";
import StrandedEntries from "../../components/StrandedEntries";
import { errorMessage } from "../../components/sheets/errors";
import { strandedNotice } from "../../session/stranded";
import type { SyncStatus } from "../../session/useSyncStatus";
import { useArmed } from "../useArmed";

export function SyncStrip({
  status,
  drained,
  onResume,
  serverLog,
  deviceLog,
  canRelease = false,
  onTakeOver,
}: {
  status: SyncStatus;
  drained: boolean;
  onResume: () => void;
  /** The official log and the device's optimistic one (stranded note). */
  serverLog: GameLog;
  deviceLog: GameLog;
  /** Staff: offer "Spiel übernehmen" for a game another device holds. */
  canRelease?: boolean;
  onTakeOver?: () => Promise<void>;
}) {
  // Taking a game over locks the other device out: the button asks once more.
  const { armed, arm, disarm } = useArmed<"takeover">();
  const confirming = armed === "takeover";
  const [takingOver, setTakingOver] = useState(false);
  const [takeOverError, setTakeOverError] = useState<string | null>(null);
  const waiting =
    status.pending === 1
      ? "1 Eintrag noch nicht übertragen"
      : `${status.pending} Einträge noch nicht übertragen`;
  if (status.paused === "device" || status.paused === "auth") {
    return (
      <div aria-label="Übertragung" className="syncstrip syncstrip-stop" role="status">
        <p className="syncstrip-text">
          {status.paused === "device"
            ? "Nur lesen – das Spiel läuft auf einem anderen Gerät."
            : "Schreiben gesperrt – bitte neu anmelden."}
          {status.paused === "device" && status.pending > 0 ? (
            <span className="syncstrip-sub syncstranded-head">
              {strandedNotice(status.pending)}
            </span>
          ) : null}
          {status.paused === "device" && confirming ? (
            <span className="syncstrip-sub">
              Das andere Gerät kann danach nicht mehr schreiben. Nur
              übernehmen, wenn es ausgefallen ist.
            </span>
          ) : status.paused === "device" && !canRelease ? (
            <span className="syncstrip-sub">
              Die Turnierleitung kann die Gerätesperre aufheben.
            </span>
          ) : null}
          {takeOverError === null ? null : (
            <span className="syncstrip-sub" role="alert">
              {takeOverError}
            </span>
          )}
        </p>
        {status.paused === "device" && status.pending > 0 ? (
          <StrandedEntries
            deviceLog={deviceLog}
            serverLog={serverLog}
            status={status}
          />
        ) : null}
        {status.paused === "device" && canRelease && onTakeOver !== undefined ? (
          <span className="syncstrip-actions">
            <button className="syncstrip-btn" onClick={onResume} type="button">
              Erneut prüfen
            </button>
            <button
              className={
                confirming
                  ? "syncstrip-btn syncstrip-btn-strong is-armed"
                  : "syncstrip-btn"
              }
              disabled={takingOver}
              onClick={() => {
                if (!confirming) {
                  arm("takeover");
                  return;
                }
                disarm();
                setTakingOver(true);
                setTakeOverError(null);
                onTakeOver()
                  .catch((failure: unknown) =>
                    setTakeOverError(
                      errorMessage(
                        failure,
                        "Übernehmen hat nicht geklappt. Bitte erneut versuchen.",
                      ),
                    ),
                  )
                  .finally(() => setTakingOver(false));
              }}
              type="button"
            >
              {takingOver
                ? "Übernehmen …"
                : confirming
                  ? "Übernehmen"
                  : "Spiel übernehmen"}
            </button>
          </span>
        ) : (
          <button className="syncstrip-btn" onClick={onResume} type="button">
            Erneut prüfen
          </button>
        )}
      </div>
    );
  }
  if (status.paused === "offline" || !status.online) {
    return (
      <div aria-label="Übertragung" className="syncstrip syncstrip-off" role="status">
        <p className="syncstrip-text">
          Offline ·{" "}
          {status.pending > 0 ? waiting : "Einträge werden hier gespeichert"}
        </p>
      </div>
    );
  }
  if (status.pending > 0) {
    return (
      <div aria-label="Übertragung" className="syncstrip syncstrip-wait" role="status">
        <p className="syncstrip-text">Spielstand vorläufig · {waiting}</p>
      </div>
    );
  }
  if (drained) {
    return (
      <div aria-label="Übertragung" className="syncstrip syncstrip-ok" role="status">
        <p className="syncstrip-text">✓ Alles gesendet</p>
      </div>
    );
  }
  return null;
}
