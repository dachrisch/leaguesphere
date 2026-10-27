import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  Game,
  GameLog,
  GameLogEventInput,
  GameLogWrite,
  GameSetup,
  Penalty,
  RosterPlayer,
} from "../api/types";
import AppHeader from "../components/AppHeader";
import EventLog, {
  logRows,
  undoBody,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader, { isPossessing } from "../components/ScoreHeader";
import SyncBadge, { pauseReason } from "../components/SyncBadge";
import MoreSheet, { type MoreMode } from "../components/sheets/MoreSheet";
import PenaltySheet from "../components/sheets/PenaltySheet";
import SeriesSheet, {
  type SeriesMode,
} from "../components/sheets/SeriesSheet";
import { errorMessage, IgnoredWrite } from "../components/sheets/errors";
import TouchdownSheet from "../components/sheets/TouchdownSheet";
import { cachedGet, snapshotKey } from "../offline/snapshot";
import {
  createGameSession,
  type GameSession,
} from "../session/gameSession";
import { getRuntime } from "../session/runtime";
import { useSyncStatus } from "../session/useSyncStatus";

interface TrackingScreenProps {
  game: Game;
  /** Log loaded by the preparation screen; the server payload is the truth. */
  initialLog: GameLog;
  /** Finalise with the log as the screen currently shows it. */
  onFinalize: (log: GameLog) => void;
  /**
   * The write session. The flow passes one when it already built it; without
   * it the screen creates (and owns) its own.
   */
  session?: GameSession;
  /** Header chrome owned by the flow. */
  onBack?: () => void;
  onLogout?: () => void;
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
 * Every write goes through {@link GameSession}: online it reaches the API and
 * the answer replaces the log; offline (or after a lost answer) it is queued
 * and the screen shows the last server payload plus the queued ops, marked
 * provisional. The score is never recomputed — the field app only adds the
 * queued deltas to the server's score until the next payload replaces both.
 * Undo keeps deleted rows visible and struck through; undoing a row that never
 * left the device removes its queued op instead of calling `DELETE`.
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
  session: providedSession,
  onBack,
  onLogout,
}: TrackingScreenProps) {
  const runtime = getRuntime();
  const [session] = useState<GameSession>(
    () =>
      providedSession ??
      createGameSession({
        gameId: game.id,
        initialLog,
        runtime,
      }),
  );
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

  /**
   * The live log from the session. The subscription also adopts the server's
   * possession marker, except while this screen is changing it (a log answer
   * still describes the state *before* the tap).
   */
  const subscribeLog = useCallback(
    (onStoreChange: () => void) =>
      session.subscribe((next, source) => {
        // Only an authoritative payload may move the possession marker: a
        // write's answer still describes the state before the tap.
        if (
          source === "refresh" &&
          !possessionInFlight.current &&
          Object.prototype.hasOwnProperty.call(next, "inPossession")
        ) {
          setPossession(next.inPossession ?? null);
        }
        onStoreChange();
      }),
    [session],
  );
  const log = useSyncExternalStore(subscribeLog, session.getLog, session.getLog);

  const rows = useMemo(() => logRows(log), [log]);
  const finished = game.status.trim().toLowerCase() === "beendet";
  const status = useSyncStatus(game.id);
  // The server said this device may not write (another device holds the game,
  // or the session expired). Read-only with the reason, not a silent failure.
  const readOnly = status.paused === "device" || status.paused === "auth";
  const stopReason = pauseReason(status.paused);

  useEffect(() => {
    // Warm the penalty catalogue while the network is still there: the sheet
    // may only be opened on the sideline, with no connection left.
    void cachedGet<Penalty[]>(
      snapshotKey.penalties(),
      "/api/config/scorecard/penalties",
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    // The roster is the only source for the jersey grid. A failure leaves it
    // empty on purpose: the sheets then offer the numeric fallback.
    cachedGet<RosterPlayer[]>(
      snapshotKey.roster(game.id),
      `/api/game/${game.id}/roster`,
    )
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
    cachedGet<GameSetup>(
      snapshotKey.setup(game.id),
      `/api/game/${game.id}/setup`,
    )
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
   * Ask the server which team holds the ball and take that answer.
   *
   * Used after a failed possession change: the optimistic marker is a guess,
   * the log is the truth. A read that fails too keeps the last known value —
   * the next write or reload corrects it.
   */
  const resyncPossession = async (): Promise<void> => {
    try {
      const fresh = await session.refresh();
      if (Object.prototype.hasOwnProperty.call(fresh, "inPossession")) {
        setPossession(fresh.inPossession ?? null);
      }
    } catch {
      // Keep the local value; nothing else to do here.
    }
  };

  const takePossession = async (teamName: string): Promise<void> => {
    if (possessionInFlight.current || teamName === possession || readOnly) {
      return;
    }
    const previous = possession;
    possessionInFlight.current = true;
    setPossession(teamName);
    setPossessionPending(true);
    setPossessionError(null);
    try {
      // Online this is a `PUT`; offline (or after a lost answer) the session
      // queues it and resolves, so the marker stays where the tap put it.
      await session.setPossession(teamName);
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
    if (undoInFlight.current || halftimePending || readOnly) {
      return;
    }
    undoInFlight.current = true;
    setUndoKey(row.key);
    setUndoError(null);
    try {
      // A row with a synthetic (negative) id never reached the server: the
      // session drops that queued op locally and never sends `DELETE`.
      const local =
        row.teamLogId !== null && row.teamLogId < 0
          ? row.teamLogId
          : undefined;
      await session.undo(undoBody(row), local);
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
    if (readOnly) {
      throw new IgnoredWrite(
        stopReason ?? "Dieses Gerät darf keine Einträge schreiben.",
      );
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
      // Online this is a `POST`; offline (or after a lost answer) the session
      // queues the op with its `client_id` and shows it optimistically. The
      // answer is the whole log, so it replaces what is on screen.
      await session.writeEvent(body);
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
    if (halftimeInFlight.current || !log.isFirstHalf || readOnly) {
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
      // Online a `PUT`; offline the op is queued and the half flips locally so
      // the next entry already belongs to the second half.
      await session.halftime();
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
    const target = secondHalfTeam();
    if (target !== null) {
      await takePossession(target);
    }
    try {
      // The marker row ("2. Halbzeit gestartet") arrives with the log. A
      // payload from an older server cannot put the screen back into the first
      // half: the session already flipped it.
      await session.refresh();
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
    readOnly ||
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
    halftimePending ||
    posting ||
    possessionPending ||
    undoKey !== null ||
    readOnly;

  return (
    <div className="app-shell tracking">
      <AppHeader
        kicker="Scorecard"
        onBack={onBack}
        onLogout={onLogout}
        title="Spiel läuft"
      />
      <SyncBadge gameId={game.id} />
      {stopReason === null ? null : (
        <div className="syncstop" role="alert">
          <p>
            {status.paused === "device"
              ? "Schreiben gesperrt – ein anderes Gerät hält dieses Spiel."
              : "Schreiben gesperrt – bitte neu anmelden."}
          </p>
          <button
            className="setlink"
            onClick={() => void status.resume()}
            type="button"
          >
            Erneut prüfen
          </button>
        </div>
      )}
      {status.pending > 0 ? (
        <p className="vorlaeufig">
          Spielstand vorläufig ·{" "}
          {status.pending === 1
            ? "1 Eintrag noch nicht übertragen"
            : `${status.pending} Einträge noch nicht übertragen`}
        </p>
      ) : null}
      <ScoreHeader
        away={log.away}
        disabled={possessionPending || halftimePending || readOnly}
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
        disabled={halftimePending || readOnly}
        error={undoError}
        onUndo={(row) => void undo(row)}
        rows={rows}
        undoKey={undoKey}
      />
      <footer className="trackfoot">
        <button
          className="startbtn"
          disabled={readOnly}
          onClick={() => onFinalize(log)}
          type="button"
        >
          Spielende und Bestätigung
        </button>
        {readOnly ? (
          <p className="setupnote">
            Nur lesend – Einträge sind auf diesem Gerät gesperrt.
          </p>
        ) : null}
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
