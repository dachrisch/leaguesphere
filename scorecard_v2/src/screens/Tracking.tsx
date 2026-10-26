import { useMemo, useState } from "react";

import { ApiError, apiDelete, apiPut } from "../api/client";
import type { Game, GameLog } from "../api/types";
import AppHeader from "../components/AppHeader";
import EventLog, {
  logRows,
  undoBody,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader from "../components/ScoreHeader";

interface TrackingScreenProps {
  game: Game;
  /** Log loaded by the preparation screen; the server payload is the truth. */
  initialLog: GameLog;
  /** Task 15 owns the finalise screen; this only navigates. */
  onFinalize: () => void;
}

function errorText(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError &&
    typeof error.detail === "string" &&
    error.detail.trim() !== ""
  ) {
    return error.detail;
  }
  return fallback;
}

/**
 * Live tracking shell: score header, possession switch, event log and undo.
 *
 * The log is never edited locally. Every write answers with the full server
 * payload (`DELETE` directly, `PUT /possession` none), so the score and the
 * rows always come from the server. Undo keeps deleted rows visible and
 * struck through — the log is an audit trail, not a list of live plays.
 */
export default function TrackingScreen({
  game,
  initialLog,
  onFinalize,
}: TrackingScreenProps) {
  const [log, setLog] = useState<GameLog>(initialLog);
  const [possession, setPossession] = useState<string | null>(
    initialLog.inPossession,
  );
  const [possessionPending, setPossessionPending] = useState(false);
  const [possessionError, setPossessionError] = useState<string | null>(null);
  const [undoKey, setUndoKey] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const rows = useMemo(() => logRows(log), [log]);

  /**
   * Replace the log with a server answer. `inPossession` is only adopted when
   * the payload carries it, so an older server does not silently drop the
   * possession the screen already shows.
   */
  const replaceLog = (next: GameLog): void => {
    setLog(next);
    if (Object.prototype.hasOwnProperty.call(next, "inPossession")) {
      setPossession(next.inPossession ?? null);
    }
  };

  const takePossession = async (teamName: string): Promise<void> => {
    if (possessionPending || teamName === possession) {
      return;
    }
    const previous = possession;
    setPossession(teamName);
    setPossessionPending(true);
    setPossessionError(null);
    try {
      await apiPut<void>(`/api/game/${game.id}/possession`, {
        team: teamName,
      });
    } catch (failure) {
      setPossession(previous);
      setPossessionError(
        errorText(
          failure,
          "Der Ballbesitz konnte nicht geändert werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      setPossessionPending(false);
    }
  };

  const undo = async (row: LogRow): Promise<void> => {
    if (undoKey !== null) {
      return;
    }
    setUndoKey(row.key);
    setUndoError(null);
    try {
      const next = await apiDelete<GameLog>(
        `/api/gamelog/${game.id}`,
        undoBody(row),
      );
      replaceLog(next);
    } catch (failure) {
      setUndoError(
        errorText(
          failure,
          "Der Eintrag konnte nicht rückgängig gemacht werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      setUndoKey(null);
    }
  };

  return (
    <div className="app-shell tracking">
      <AppHeader kicker="Scorecard" title="Spiel läuft" />
      <ScoreHeader
        away={log.away}
        disabled={possessionPending}
        home={log.home}
        isFirstHalf={log.isFirstHalf}
        onPossession={(teamName) => void takePossession(teamName)}
        possession={possession}
      />
      {possessionError === null ? null : (
        <p className="trackerror" role="alert">
          {possessionError}
        </p>
      )}
      <EventLog
        error={undoError}
        onUndo={(row) => void undo(row)}
        rows={rows}
        undoKey={undoKey}
      />
      <footer className="trackfoot">
        <button className="startbtn" onClick={onFinalize} type="button">
          Spielende und Bestätigung
        </button>
      </footer>
    </div>
  );
}
