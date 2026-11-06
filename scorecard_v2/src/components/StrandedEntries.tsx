/**
 * The entries a read-only phone still holds after another device took over.
 *
 * Display only: the list is kept on the device and can be opened in one tap,
 * but there is no retry, no drop and no delivery here. Whether such entries
 * may still be delivered is the team's open take-over decision.
 */
import type { GameLog } from "../api/types";
import type { SyncStatus } from "../session/useSyncStatus";
import {
  isStranded,
  strandedOpTitle,
  strandedScoreNote,
  strandedScores,
} from "../session/stranded";

export default function StrandedEntries({
  status,
  serverLog,
  deviceLog,
}: {
  status: SyncStatus;
  serverLog: GameLog;
  deviceLog: GameLog;
}) {
  if (!isStranded(status)) {
    return null;
  }
  const note = strandedScoreNote(strandedScores(serverLog, deviceLog));
  const summary =
    status.pending === 1 ? "1 Eintrag anzeigen" : `${status.pending} Einträge anzeigen`;

  return (
    <>
      {note === null ? null : <p className="syncstranded-note">{note}</p>}
      <details className="syncstranded">
        <summary>{summary}</summary>
        <ul className="syncstranded-list">
          {status.pendingOps.map((op) => (
            <li key={op.id}>{strandedOpTitle(op)}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
