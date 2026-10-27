import { useEffect, useMemo, useRef, useState } from "react";

import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type {
  Game,
  GameLog,
  GameLogEventInput,
  GameLogWrite,
  RosterPlayer,
} from "../api/types";
import AppHeader from "../components/AppHeader";
import EventLog, {
  logRows,
  undoBody,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader, { isPossessing } from "../components/ScoreHeader";
import { errorMessage } from "../components/sheets/Sheet";
import TouchdownSheet from "../components/sheets/TouchdownSheet";

interface TrackingScreenProps {
  game: Game;
  /** Log loaded by the preparation screen; the server payload is the truth. */
  initialLog: GameLog;
  /** Task 15 owns the finalise screen; this only navigates. */
  onFinalize: () => void;
}

type Side = RosterPlayer["side"];

/**
 * The remaining entry tiles. They are visible but disabled until their sheets
 * land, so the official sees that the slot exists.
 */
const PLACEHOLDER_TILES = [
  "1st Down",
  "Turnover",
  "Interception",
  "Spielzeit",
  "Auszeit",
];

const CONFIRMATION: Record<string, string> = {
  Touchdown: "Touchdown gespeichert",
  "First Down": "1st Down gespeichert",
  Turnover: "Turnover gespeichert",
  Interception: "Interception gespeichert",
  Spielzeit: "Spielzeit gespeichert",
  Auszeit: "Auszeit gespeichert",
};

/** Short confirmation after a write, with the jersey or time it recorded. */
export function describeSaved(events: GameLogEventInput[]): string {
  const [first] = events;
  if (first === undefined) {
    return "Eintrag gespeichert";
  }
  const label = CONFIRMATION[first.name] ?? `${first.name} gespeichert`;
  if (first.input !== undefined) {
    return `${label} · ${first.input}`;
  }
  return first.player === undefined ? label : `${label} · #${first.player}`;
}

/**
 * Live tracking shell: score header, possession switch, the action block, the
 * event log and undo.
 *
 * The log is never edited locally. Every write answers with the full server
 * payload (`DELETE` directly, `PUT /possession` none), so the score and the
 * rows always come from the server. Undo keeps deleted rows visible and
 * struck through — the log is an audit trail, not a list of live plays.
 *
 * Event writes carry the possession team and the half from the payload —
 * never a guess from the current time. The roster is loaded once; without it
 * the touchdown sheet falls back to a numeric jersey field instead of
 * blocking the game.
 */
export default function TrackingScreen({
  game,
  initialLog,
  onFinalize,
}: TrackingScreenProps) {
  const [log, setLog] = useState<GameLog>(initialLog);
  const [possession, setPossession] = useState<string | null>(
    initialLog.inPossession ?? null,
  );
  const [possessionPending, setPossessionPending] = useState(false);
  const [possessionError, setPossessionError] = useState<string | null>(null);
  const [undoKey, setUndoKey] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [sheet, setSheet] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Refs, not state: two taps in the same tick both see the old state and
  // would otherwise fire two writes.
  const possessionInFlight = useRef(false);
  const undoInFlight = useRef(false);
  const postInFlight = useRef(false);

  const rows = useMemo(() => logRows(log), [log]);
  const finished = game.status.trim().toLowerCase() === "beendet";

  useEffect(() => {
    let active = true;
    // The roster is the only source for the jersey grid. A failure leaves it
    // empty on purpose: the sheets then offer the numeric fallback.
    apiGet<RosterPlayer[]>(`/api/game/${game.id}/roster`)
      .then((players) => {
        if (active) {
          setRoster(players ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setRoster([]);
        }
      });
    return () => {
      active = false;
    };
  }, [game.id]);

  /**
   * Replace the log with a server answer. `inPossession` is only adopted when
   * the payload carries it **and** no possession change is in flight: a stale
   * DELETE response must not undo the optimistic marker.
   */
  const replaceLog = (next: GameLog): void => {
    setLog(next);
    if (
      !possessionInFlight.current &&
      Object.prototype.hasOwnProperty.call(next, "inPossession")
    ) {
      setPossession(next.inPossession ?? null);
    }
  };

  const takePossession = async (teamName: string): Promise<void> => {
    if (possessionInFlight.current || teamName === possession) {
      return;
    }
    const previous = possession;
    possessionInFlight.current = true;
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
        errorMessage(
          failure,
          "Der Ballbesitz konnte nicht geändert werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      possessionInFlight.current = false;
      setPossessionPending(false);
    }
  };

  const undo = async (row: LogRow): Promise<void> => {
    if (undoInFlight.current) {
      return;
    }
    undoInFlight.current = true;
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
        errorMessage(
          failure,
          "Der Eintrag konnte nicht rückgängig gemacht werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      undoInFlight.current = false;
      setUndoKey(null);
    }
  };

  const possessionTeam = possession;
  const possessionSide: Side | null =
    possessionTeam === null
      ? null
      : isPossessing(log.home, possessionTeam)
        ? "home"
        : isPossessing(log.away, possessionTeam)
          ? "away"
          : null;

  /**
   * Write one play. The sheet that called it stays open until this resolves,
   * so a rejected write keeps the picked jersey on screen together with the
   * server's `detail`.
   */
  const submit = async (events: GameLogEventInput[]): Promise<void> => {
    if (
      postInFlight.current ||
      finished ||
      possessionTeam === null ||
      possessionSide === null
    ) {
      return;
    }
    postInFlight.current = true;
    setPosting(true);
    setConfirmation(null);
    const body: GameLogWrite = {
      gameId: game.id,
      team: possessionTeam,
      half: log.isFirstHalf ? 1 : 2,
      event: events,
    };
    try {
      const next = await apiPost<GameLog>(`/api/gamelog/${game.id}`, body);
      replaceLog(next);
      setConfirmation(describeSaved(events));
    } finally {
      postInFlight.current = false;
      setPosting(false);
    }
  };

  const openSheet = (): void => {
    setConfirmation(null);
    setSheet(true);
  };

  const composerDisabled =
    posting || finished || possessionTeam === null || possessionSide === null;
  const touchdownLabel =
    possessionTeam === null ? "Touchdown" : `Touchdown ${possessionTeam}`;

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
      {confirmation === null ? null : (
        <p className="trackok" role="status">
          {confirmation}
        </p>
      )}
      <section aria-label="Einträge" className="actions">
        <button
          className={
            possessionSide === null ? "tdbtn" : `tdbtn ${possessionSide}`
          }
          disabled={composerDisabled}
          onClick={openSheet}
          type="button"
        >
          {touchdownLabel}
        </button>
        {PLACEHOLDER_TILES.map((label) => (
          <button
            className="action"
            disabled
            key={label}
            title="Folgt in einem späteren Schritt."
            type="button"
          >
            {label}
          </button>
        ))}
        <button
          className="action"
          disabled
          title="Folgt in einem späteren Schritt."
          type="button"
        >
          Strafe
        </button>
        <button
          className="action"
          disabled
          title="Folgt in einem späteren Schritt."
          type="button"
        >
          Safety
        </button>
      </section>
      {finished ? (
        <p className="finishednote" role="status">
          Dieses Spiel ist beendet.
        </p>
      ) : possessionTeam === null ? (
        <p className="trackhint">Ballbesitz wählen, um Einträge zu erfassen.</p>
      ) : null}
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

      {sheet && possessionTeam !== null && possessionSide !== null ? (
        <TouchdownSheet
          onClose={() => setSheet(false)}
          onSubmit={submit}
          passcheck={game.passcheck === true}
          roster={roster}
          side={possessionSide}
          teamName={possessionTeam}
        />
      ) : null}
    </div>
  );
}
