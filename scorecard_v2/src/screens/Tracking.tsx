import { useEffect, useMemo, useRef, useState } from "react";

import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type {
  Game,
  GameLog,
  GameLogEventInput,
  GameLogWrite,
  GameSetup,
  RosterPlayer,
} from "../api/types";
import AppHeader from "../components/AppHeader";
import EventLog, {
  logRows,
  undoBody,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader, { isPossessing } from "../components/ScoreHeader";
import MoreSheet, { type MoreMode } from "../components/sheets/MoreSheet";
import PenaltySheet from "../components/sheets/PenaltySheet";
import SeriesSheet, {
  type SeriesMode,
} from "../components/sheets/SeriesSheet";
import { errorMessage, IgnoredWrite } from "../components/sheets/errors";
import TouchdownSheet from "../components/sheets/TouchdownSheet";

interface TrackingScreenProps {
  game: Game;
  /** Log loaded by the preparation screen; the server payload is the truth. */
  initialLog: GameLog;
  /** Task 15 owns the finalise screen; this only navigates. */
  onFinalize: () => void;
}

type Side = RosterPlayer["side"];

/** The open sheet: the touchdown entry, a series/time entry, or a more event. */
type SheetState =
  | { kind: "touchdown" }
  | { kind: "series"; mode: SeriesMode }
  | { kind: "penalty" }
  | { kind: "more"; mode: MoreMode };

/** The series/time tiles of the composer grid. */
const SERIES_TILES: { mode: SeriesMode; label: string }[] = [
  { mode: "first", label: "1st Down" },
  { mode: "turnover", label: "Turnover" },
  { mode: "interception", label: "Interception" },
  { mode: "time", label: "Spielzeit" },
  { mode: "timeout", label: "Auszeit" },
];

const CONFIRMATION: Record<string, string> = {
  Touchdown: "Touchdown gespeichert",
  "First Down": "1st Down gespeichert",
  Turnover: "Turnover gespeichert",
  Interception: "Interception gespeichert",
  Spielzeit: "Spielzeit gespeichert",
  Auszeit: "Auszeit gespeichert",
  Strafe: "Strafe gespeichert",
  "Safety (+1)": "Safety gespeichert",
  "Safety (+2)": "Safety gespeichert",
  Overtime: "Overtime gespeichert",
};

/**
 * Events after which the ball stays where it is.
 *
 * Everything else hands the ball to the other team — a touchdown, a turnover,
 * an interception, a safety and an overtime score all kick off again. v1 also
 * flipped on an `Auszeit`, which was a bug: a timeout is called by the team in
 * possession and does not change it. A write group (touchdown + conversion)
 * counts as one play; if any of its rows keeps the ball, the group does.
 */
const KEEP_POSSESSION = new Set([
  "Strafe",
  "Spielzeit",
  "Auszeit",
  "First Down",
]);

/** Whether a successful write hands the ball to the other team. */
export function flipsPossession(events: GameLogEventInput[]): boolean {
  return !events.some((event) => KEEP_POSSESSION.has(event.name));
}

/**
 * Read a stored first possession back into a side. v2 writes `home`/`away`,
 * the old app wrote the team name, and `{}` means "no setup".
 */
function setupSide(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side | null {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "") {
    return null;
  }
  if (token === "home") {
    return "home";
  }
  if (token === "away") {
    return "away";
  }
  if (home !== null && token === home.trim().toLowerCase()) {
    return "home";
  }
  if (away !== null && token === away.trim().toLowerCase()) {
    return "away";
  }
  return null;
}

/**
 * The team that starts the second half: the side that did **not** receive the
 * opening kickoff, exactly like v1 (`Details.handleHalftime` flips
 * `gameSetup.fhPossession`, not the current possession).
 *
 * Returns `null` when the setup carries no usable first possession — the caller
 * then falls back to handing the ball to the other team.
 */
export function secondHalfPossession(
  setup: GameSetup | null | undefined,
  home: string | null,
  away: string | null,
): string | null {
  const first = setupSide(setup?.fhPossession, home, away);
  if (first === null) {
    return null;
  }
  return first === "home" ? away : home;
}

/**
 * The team a submission is recorded for.
 *
 * Everything is credited to the possessing team, except an interception: the
 * defense statistics read the row's team as the team that made the play, and
 * v1 records it for the opponent. Sending the passer would credit every
 * interception to the wrong side.
 *
 * Throws when the write must not happen at all, so the calling sheet keeps its
 * state and shows why.
 */
export function writeTeam(
  events: GameLogEventInput[],
  possession: string | null,
  opponent: string | null,
): string {
  const intercepts = events.some((event) => event.name === "Interception");
  const team = intercepts ? opponent : possession;
  if (possession === null || team === null) {
    throw new IgnoredWrite("Kein Ballbesitz – bitte Team wählen.");
  }
  return team;
}

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
  // `null` until the roster request settles — an empty array would be a real
  // "no roster" and must not be shown while the fetch is still running.
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);
  // The first possession decides who starts the second half. `null` while the
  // request runs (or after it failed): the half-time then falls back to
  // handing the ball to the other team.
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [posting, setPosting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [confirmHalftime, setConfirmHalftime] = useState(false);
  const [halftimePending, setHalftimePending] = useState(false);
  const [halftimeError, setHalftimeError] = useState<string | null>(null);
  // Refs, not state: two taps in the same tick both see the old state and
  // would otherwise fire two writes.
  const possessionInFlight = useRef(false);
  const undoInFlight = useRef(false);
  const postInFlight = useRef(false);
  const halftimeInFlight = useRef(false);

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

  useEffect(() => {
    let active = true;
    // Read once, long before the half-time: the setup holds the opening
    // possession, which decides who starts the second half. A failed read
    // leaves it `null` and the half-time falls back to switching the ball.
    apiGet<GameSetup>(`/api/game/${game.id}/setup`)
      .then((payload) => {
        if (active) {
          setSetup(payload ?? {});
        }
      })
      .catch(() => {
        // Nothing to do: `null` already means "no setup to trust".
      });
    return () => {
      active = false;
    };
  }, [game.id]);

  /**
   * Replace the log with a server answer.
   *
   * `inPossession` is only adopted when the payload carries it **and** the
   * caller says it is fresh: a `POST` answers with the possession as it was
   * *before* the change of possession the play itself causes, and a stale
   * `DELETE` must not undo the optimistic marker either. The client owns the
   * marker after its own write and re-reads the truth when a write fails.
   */
  const replaceLog = (
    next: GameLog,
    { adoptPossession = true }: { adoptPossession?: boolean } = {},
  ): void => {
    setLog(next);
    if (
      adoptPossession &&
      !possessionInFlight.current &&
      Object.prototype.hasOwnProperty.call(next, "inPossession")
    ) {
      setPossession(next.inPossession ?? null);
    }
  };

  /**
   * Ask the server which team holds the ball and take that answer.
   *
   * Used after a failed possession `PUT`: the optimistic marker is a guess, the
   * log is the truth. The adoption is direct rather than through
   * {@link replaceLog} because the failed change is still "in flight" here and
   * would otherwise be skipped. A read that fails too leaves the last known
   * value in place — the next write or reload corrects it.
   */
  const resyncPossession = async (): Promise<void> => {
    try {
      const fresh = await apiGet<GameLog>(`/api/gamelog/${game.id}`);
      setLog(fresh);
      if (Object.prototype.hasOwnProperty.call(fresh, "inPossession")) {
        setPossession(fresh.inPossession ?? null);
      }
    } catch {
      // Keep the local value; nothing else to do here.
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
      // Show the correction at once (no flicker), then let the server decide:
      // the `PUT` may have been rejected after it was applied.
      setPossession(previous);
      setPossessionError(
        errorMessage(
          failure,
          "Der Ballbesitz konnte nicht geändert werden. Bitte erneut versuchen.",
        ),
      );
      await resyncPossession();
    } finally {
      possessionInFlight.current = false;
      setPossessionPending(false);
    }
  };

  const undo = async (row: LogRow): Promise<void> => {
    if (undoInFlight.current || halftimePending) {
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

  const logTeamName = (team: typeof log.home): string | null => {
    const name = team.name?.trim();
    return name === undefined || name === "" ? null : name;
  };

  const possessionSide: Side | null =
    possession === null
      ? null
      : isPossessing(log.home, possession)
        ? "home"
        : isPossessing(log.away, possession)
          ? "away"
          : null;

  const opponentSide: Side | null =
    possessionSide === "home"
      ? "away"
      : possessionSide === "away"
        ? "home"
        : null;

  /**
   * Display names resolved through the log, so a possession stored as a team
   * pk still reads "Touchdown Ravens" and not "Touchdown 12".
   */
  const possessionName =
    (possessionSide === "home"
      ? logTeamName(log.home)
      : possessionSide === "away"
        ? logTeamName(log.away)
        : null) ?? possession;
  const opponentName =
    opponentSide === "home" ? logTeamName(log.home) : logTeamName(log.away);

  /**
   * Write one play. The sheet that called it stays open until this resolves,
   * so a rejected write keeps the picked jersey on screen together with the
   * server's `detail`. A write that must not happen rejects as
   * {@link IgnoredWrite} — resolving would close the sheet and look saved.
   *
   * `team` overrides the possessing team for the entries that are recorded for
   * a team the sheet picked (a penalty charged to the opponent, a safety
   * scored by the defense). Everything else is credited by {@link writeTeam}.
   *
   * A successful write hands the ball over for the change-of-possession events
   * ({@link flipsPossession}); the flip is a separate `PUT` because the server
   * does not move the ball for us. It is awaited so a second tap cannot start
   * from a stale possession, and a failed flip keeps the log (the next reload
   * reads the truth) while showing why.
   */
  const submit = async (
    events: GameLogEventInput[],
    teamOverride?: string,
  ): Promise<void> => {
    if (postInFlight.current) {
      throw new IgnoredWrite("Der Eintrag wird gerade gespeichert.");
    }
    if (finished) {
      throw new IgnoredWrite("Dieses Spiel ist beendet.");
    }
    if (possessionSide === null) {
      throw new IgnoredWrite("Kein Ballbesitz – bitte Team wählen.");
    }
    const team = teamOverride ?? writeTeam(events, possessionName, opponentName);
    postInFlight.current = true;
    setPosting(true);
    setConfirmation(null);
    const body: GameLogWrite = {
      gameId: game.id,
      team,
      half: log.isFirstHalf ? 1 : 2,
      event: events,
    };
    try {
      const next = await apiPost<GameLog>(`/api/gamelog/${game.id}`, body);
      // The answer still carries the possession of *before* this play; the
      // marker follows the flip below (or the server, if the flip fails).
      replaceLog(next, { adoptPossession: false });
      setConfirmation(describeSaved(events));
      if (flipsPossession(events) && opponentName !== null) {
        await takePossession(opponentName);
      }
    } finally {
      postInFlight.current = false;
      setPosting(false);
    }
  };

  /**
   * The team that starts the second half: the side that did **not** receive the
   * opening kickoff, exactly like v1 (`GameSetup.fhPossession`), whatever the
   * last play did — the teams change ends at half-time, so "flip the ball" is
   * only right when the half happened to end with the ball away from the
   * kickoff side. {@link setup} is read once when the screen opens, so the
   * half-time never waits for it; without a usable setup the ball simply goes
   * to the other team.
   */
  const secondHalfTeam = (): string | null =>
    secondHalfPossession(setup, logTeamName(log.home), logTeamName(log.away)) ??
    opponentName;

  /**
   * Halbzeit: the server writes the marker and moves the game to the second
   * half; the possession switch is ours, because the server keeps the first
   * possession.
   *
   * The half is switched locally as soon as the `PUT` is accepted, so the log
   * and the next write are in the second half even if the log reload below
   * fails. A rejected transition (409) leaves everything as it was and shows
   * the server's `detail`.
   */
  const startHalftime = async (): Promise<void> => {
    if (halftimeInFlight.current || !log.isFirstHalf) {
      return;
    }
    if (possessionInFlight.current) {
      // Without this the flip below would silently do nothing and the second
      // half would start with whoever the manual change left in possession.
      setHalftimeError(
        "Der Ballbesitz wird gerade geändert. Bitte kurz warten.",
      );
      return;
    }
    halftimeInFlight.current = true;
    setHalftimePending(true);
    setHalftimeError(null);
    setConfirmHalftime(false);
    try {
      await apiPut<void>(`/api/game/${game.id}/halftime`, {});
    } catch (failure) {
      setHalftimeError(
        errorMessage(
          failure,
          "Die Halbzeit konnte nicht gestartet werden. Bitte erneut versuchen.",
        ),
      );
      halftimeInFlight.current = false;
      setHalftimePending(false);
      return;
    }
    setLog((current) => ({ ...current, isFirstHalf: false }));
    const target = secondHalfTeam();
    if (target !== null) {
      await takePossession(target);
    }
    try {
      // The marker row ("2. Halbzeit gestartet") only exists server-side. The
      // half switch is already local, so a payload from an older server cannot
      // put the game back into the first half, and the possession stays the one
      // this screen just set.
      const fresh = await apiGet<GameLog>(`/api/gamelog/${game.id}`);
      replaceLog({ ...fresh, isFirstHalf: false }, { adoptPossession: false });
    } catch {
      // The half is already switched; the refresh only adds the marker. The
      // next write answers with the whole log anyway.
    }
    halftimeInFlight.current = false;
    setHalftimePending(false);
  };

  const openSheet = (next: SheetState): void => {
    setConfirmation(null);
    setSheet(next);
  };

  const composerDisabled =
    posting ||
    possessionPending ||
    halftimePending ||
    finished ||
    possessionSide === null ||
    possessionName === null;
  const touchdownLabel =
    possessionName === null ? "Touchdown" : `Touchdown ${possessionName}`;
  /**
   * Starting the half writes two things in a row (the marker, then the ball).
   * A possession change or an undo still on its way would land in between and
   * either skip the flip or answer with a stale half, so the block waits.
   */
  const halftimeDisabled =
    halftimePending || posting || possessionPending || undoKey !== null;

  return (
    <div className="app-shell tracking">
      <AppHeader kicker="Scorecard" title="Spiel läuft" />
      <ScoreHeader
        away={log.away}
        disabled={possessionPending || halftimePending}
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
          onClick={() => openSheet({ kind: "touchdown" })}
          type="button"
        >
          {touchdownLabel}
        </button>
        {SERIES_TILES.map((tile) => (
          <button
            className="action"
            disabled={composerDisabled}
            key={tile.mode}
            onClick={() => openSheet({ kind: "series", mode: tile.mode })}
            type="button"
          >
            {tile.label}
          </button>
        ))}
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "penalty" })}
          type="button"
        >
          Strafe
        </button>
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "more", mode: "safety" })}
          type="button"
        >
          Safety
        </button>
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "more", mode: "overtime" })}
          type="button"
        >
          Overtime
        </button>
      </section>
      {log.isFirstHalf && !finished ? (
        <section aria-label="Halbzeit" className="halfblock">
          {confirmHalftime ? (
            <>
              <p className="halfask">Halbzeit starten?</p>
              <div className="halfactions">
                <button
                  className="action"
                  disabled={halftimePending}
                  onClick={() => setConfirmHalftime(false)}
                  type="button"
                >
                  Abbrechen
                </button>
                <button
                  className="halfbtn"
                  disabled={halftimeDisabled}
                  onClick={() => void startHalftime()}
                  type="button"
                >
                  {halftimePending ? "Halbzeit …" : "Halbzeit starten"}
                </button>
              </div>
            </>
          ) : (
            <button
              className="halfbtn"
              disabled={halftimeDisabled}
              onClick={() => setConfirmHalftime(true)}
              type="button"
            >
              Halbzeit
            </button>
          )}
          {halftimeError === null ? null : (
            <p className="trackerror" role="alert">
              {halftimeError}
            </p>
          )}
        </section>
      ) : null}
      {finished ? (
        <p className="finishednote" role="status">
          Dieses Spiel ist beendet.
        </p>
      ) : possessionName === null ? (
        <p className="trackhint">Ballbesitz wählen, um Einträge zu erfassen.</p>
      ) : null}
      <EventLog
        disabled={halftimePending}
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

      {sheet !== null &&
      possessionSide !== null &&
      possessionName !== null &&
      (sheet.kind === "touchdown" ||
        sheet.kind === "series" ||
        opponentName !== null) ? (
        sheet.kind === "touchdown" ? (
          <TouchdownSheet
            onClose={() => setSheet(null)}
            onSubmit={submit}
            passcheck={game.passcheck === true}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "series" ? (
          <SeriesSheet
            key={sheet.mode}
            mode={sheet.mode}
            onClose={() => setSheet(null)}
            onSubmit={submit}
            opponentName={opponentName ?? "–"}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "penalty" ? (
          <PenaltySheet
            onClose={() => setSheet(null)}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : (
          <MoreSheet
            key={sheet.mode}
            mode={sheet.mode}
            onClose={() => setSheet(null)}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        )
      ) : null}
    </div>
  );
}
