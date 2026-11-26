import {
  useRef,
  useState,
} from "react";

import type { GameRules } from "../api/rules";
import type {
  Game,
  GameLog,
  GameSetup,
  Official,
  RosterPlayer,
  TeamOfficial,
} from "../api/types";
import {
  forgetBreak,
  readBreakStart,
  secondsLeft,
} from "../app/break";
import {
  isMarker,
  type LogRow,
} from "../components/EventLog";
import type { SeriesMode } from "../components/sheets/SeriesSheet";
import {
  createGameSession,
  type GameSession,
} from "../session/gameSession";
import { getRuntime } from "../session/runtime";
import { useArmed } from "./useArmed";
import { useTrackingShortcuts } from "./useTrackingShortcuts";
import { useTrackingLog } from "./tracking-flow/useTrackingLog";
import { usePatFlow } from "./tracking-flow/usePatFlow";
import { useSeriesTiles } from "./tracking-flow/useSeriesTiles";
export {
  describeSaved,
  flipsPossession,
  secondHalfPossession,
  trackingSubtitle,
  trackingTitle,
  writeTeam,
} from "./tracking-flow/logic";
export { SyncStrip } from "./tracking-flow/SyncStrip";
import {
  type JerseyLater,
  type SheetState,
} from "./tracking-flow/logic";
import { TrackingPanels } from "./tracking-flow/TrackingPanels";
import {
  composerDisabled as isComposerDisabled,
  halftimeDisabled as isHalftimeDisabled,
  penaltyDisabled as isPenaltyDisabled,
  touchdownLabel as labelForTouchdown,
} from "./tracking-flow/panels";

interface TrackingScreenProps {
  game: Game;
  /** Log loaded by the preparation screen; the server payload is the truth. */
  initialLog: GameLog;
  /** Gameday name for the header context line. */
  gamedayName?: string;
  /** League display name for the header context line. */
  leagueLabel?: string;
  /**
   * When the shown log came from the snapshot instead of the network, the age
   * of that stored payload. A game that ended an hour ago then reads as stored
   * data, not as a live one.
   */
  staleSince?: number | null;
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
  gamedayName,
  leagueLabel,
  staleSince = null,
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
  /**
   * The sport definition (IFAF 2023). Until it arrives the engine uses the
   * 50-yard defaults it shipped with, so a slow or missing fetch changes
   * nothing the official sees on the standard field.
   */
  const [rules, setRules] = useState<GameRules | null>(null);
  /**
   * The setup read itself: the first possession decides who starts the second
   * half. The half-time awaits it (it resolved long before, normally) instead
   * of reading a state update that may not have landed yet; a failed read
   * resolves `null` and the half-time falls back to handing the ball to the
   * other team.
   */
  const setupLoad = useRef<Promise<GameSetup | null | undefined> | null>(null);
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [officials, setOfficials] = useState<Official[] | null>(null);
  const [officialsUnavailable, setOfficialsUnavailable] = useState(false);
  const [people, setPeople] = useState<TeamOfficial[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  /**
   * The sheets this one was opened from. Back returns to the previous popup
   * (Spielzug → Pass → …), while the close button leaves the whole sequence.
   */
  const [sheetHistory, setSheetHistory] = useState<SheetState[]>([]);
  const [posting, setPosting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /** The one-tap entry the toast can still undo or complete, if any. */
  const [quick, setQuick] = useState<SeriesMode | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  /**
   * The touchdown whose extra point is still open: asked once the try has
   * been played, credited to the scoring team with the scorer's jersey (or
   * nobody, when the touchdown was entered without a number).
   */
  const [pendingPat, setPendingPat] = useState<{
    team: string;
    jersey: number | null;
    /** The touchdown's write op, so the try's flip is linked to it. */
    originId?: string;
    /**
     * The submission the touchdown was written in. Undoing that entry has to
     * close the prompt it opened; the event ids differ from row to row, the
     * group is what names the submission.
     */
    group?: number | null;
  } | null>(null);
  /**
   * The try being answered: its team, its points and the default jersey (the
   * touchdown's scorer — he often is the converter). A direct **+1 XP** in
   * overtime opens the same step with no default.
   */
  const [patTry, setPatTry] = useState<{
    team: string;
    points: 1 | 2;
    defaultJersey: number | null;
  } | null>(null);
  /**
   * The missed try's details: an incomplete pass asks for the same facts
   * (thrower, intended receiver, defender with Deflection or Tackle), so a
   * miss is one tap away from the result choice but can still be recorded.
   */
  const [patMiss, setPatMiss] = useState<{
    team: string;
    defaultJersey: number | null;
  } | null>(null);
  const [patJersey, setPatJersey] = useState<number | null>(null);
  /**
   * The try's defensive score: "+2 Gegner" asks for the defender's jersey in
   * its own step instead of writing the row on the spot.
   */
  const [patDefense, setPatDefense] = useState(false);
  const [patDefenseJersey, setPatDefenseJersey] = useState<number | null>(null);
  /** The try's quarterback; a team may change it just for the conversion. */
  const [patQb, setPatQb] = useState<number | null>(null);
  const [patBusy, setPatBusy] = useState(false);
  /** The try's first answer: focus lands here when the touchdown tile gives way. */
  const patFirst = useRef<HTMLButtonElement>(null);
  /** The last answered try: undoing it reopens the try with the same flip origin. */
  const patOrigin = useRef<{ team: string; originId?: string } | null>(null);
  const [patError, setPatError] = useState<string | null>(null);
  const [finishBlocked, setFinishBlocked] = useState(false);
  /** The one-tap row a jersey sheet replaces once it saves. */
  const [replacing, setReplacing] = useState<LogRow | null>(null);
  /** The team whose Auszeit dialog is open. */
  const [timeoutTeam, setTimeoutTeam] = useState<string | null>(null);
  /** The half-time confirmation dialog. */
  const [halftimeOpen, setHalftimeOpen] = useState(false);
  /** The log row being corrected in place ("Ändern" next to undo). */
  const [editing, setEditing] = useState<LogRow | null>(null);
  /** Two-step buttons: a one-tap entry offers its jersey, Halbzeit asks once more. */
  const { armed, arm, disarm } = useArmed<JerseyLater | "overtime">();
  const [halftimePending, setHalftimePending] = useState(false);
  const [halftimeError, setHalftimeError] = useState<string | null>(null);
  /**
   * The half-time break runs on this device only: it starts with the marker
   * and is remembered per game, so a reload mid-break keeps counting instead
   * of starting over. A break that already elapsed is dropped on load.
   */
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(() => {
    const stored = readBreakStart(game.id);
    if (stored === null) {
      return null;
    }
    if (secondsLeft(stored) === 0) {
      forgetBreak(game.id);
      return null;
    }
    return stored;
  });
  // Refs, not state: two taps in the same tick both see the old state and
  // would otherwise fire two writes.
  const possessionInFlight = useRef(false);
  const undoInFlight = useRef(false);
  const postInFlight = useRef(false);
  const halftimeInFlight = useRef(false);

  const {
    log,
    rows,
    geometry,
    timeouts,
    unsportsmanlike,
    finished,
    status,
    officialLog,
    readOnly,
    stopReason,
    drained,
    canRelease,
    takePossession,
    undo,
    openEdit,
    submitEdit,
    logTeamName,
    possessionSide,
    opponentSide,
    possessionName,
    opponentName,
  } = useTrackingLog({
    game,
    session,
    rules,
    setRules,
    setRoster,
    setSetup,
    setupLoadRef: setupLoad,
    setOfficials,
    setOfficialsUnavailable,
    setPeople,
    possession,
    setPossession,
    setPossessionPending,
    setPossessionError,
    setUndoKey,
    setUndoError,
    editing,
    setEditing,
    setPosting,
    halftimePending,
    pendingPat,
    // The PAT handlers are created later in this screen (and move into their
    // own hook in the next layer); lazy wrappers keep the extraction verbatim.
    closePat: () => closePat(),
    reopenPat: (tryRow, keep) => reopenPat(tryRow, keep),
    possessionInFlightRef: possessionInFlight,
    undoInFlightRef: undoInFlight,
    postInFlightRef: postInFlight,
    disarm,
  });

  /**
   * Down & distance as the log tells it — recomputed on every row change. The
   * possession name ends a try whose miss wrote no row (a conversion row ends
   * it on its own).
   */
  const {
    drive,
    trySpot,
    overtime,
    touchdownGain,
    startOvertime,
    patSideOf,
    patSide,
    patPlayers,
    patDefensePlayers,
    half,
    timeoutsPerHalf,
    possessionTimeouts,
    submit,
    startHalftime,
    startSecondHalf,
    openPat,
    touchdownGroupOf,
    submitTouchdown,
    closePat,
    reopenPat,
    writePat,
    writeMissedPat,
    answerPat,
    writeDefensiveTry,
    openSinglePat,
    finish,
  } = usePatFlow({
    game,
    session,
    log,
    rows,
    geometry,
    rules,
    roster,
    setupLoadRef: setupLoad,
    logTeamName,
    possessionName,
    opponentName,
    possessionSide,
    takePossession,
    possessionInFlightRef: possessionInFlight,
    halftimeInFlightRef: halftimeInFlight,
    postInFlightRef: postInFlight,
    pendingPat,
    setPendingPat,
    patTry,
    setPatTry,
    patMiss,
    setPatMiss,
    setPatDefense,
    setPatDefenseJersey,
    setPatJersey,
    patQb,
    setPatQb,
    patBusy,
    setPatBusy,
    patFirst,
    patOriginRef: patOrigin,
    setPatError,
    setFinishBlocked,
    setHalftimePending,
    setHalftimeError,
    setHalftimeOpen,
    setBreakStartedAt,
    setPosting,
    setConfirmation,
    setQuick,
    setQuickError,
    readOnly,
    finished,
    stopReason,
    disarm,
    onFinalize,
  });

  const {
    closeSheet,
    openSheet,
    backSheet,
    pickFromSpielzug,
    undoQuick,
    tapSeriesTile,
    recentJerseys,
    submitPlay,
    takeTimeout,
    submitSeries,
  } = useSeriesTiles({
    rows,
    session,
    possessionName,
    opponentName,
    drive,
    geometry,
    sheet,
    setSheet,
    sheetHistory,
    setSheetHistory,
    replacing,
    setReplacing,
    setQuick,
    setConfirmation,
    setQuickError,
    armed,
    arm,
    disarm,
    submit,
    undo,
    openPat,
    touchdownGroupOf,
    overtime,
    openSinglePat,
    startOvertime,
  });

  const penaltyDisabled = isPenaltyDisabled({
    posting,
    possessionPending,
    halftimePending,
    finished,
    readOnly,
    possessionSide,
    possessionName,
  });
  const composerDisabled = isComposerDisabled({
    pendingPat,
    posting,
    possessionPending,
    halftimePending,
    finished,
    readOnly,
    possessionSide,
    possessionName,
  });
  const touchdownLabel = labelForTouchdown(possessionName);
  const halftimeDisabled = isHalftimeDisabled({
    pendingPat,
    halftimePending,
    posting,
    possessionPending,
    undoKey,
    readOnly,
  });

  useTrackingShortcuts({
    readOnly: readOnly || finished,
    sheetOpen:
      sheet !== null ||
      pendingPat !== null ||
      patMiss !== null ||
      editing !== null ||
      timeoutTeam !== null ||
      halftimeOpen,
    onTouchdown: () => {
      if (!composerDisabled && pendingPat === null) {
        openSheet({ kind: "touchdown" });
      }
    },
    onPlay: (type, result) => {
      if (!composerDisabled) {
        openSheet({ kind: "play", type, result });
      }
    },
    onSpielzug: () => {
      if (!composerDisabled) {
        openSheet({ kind: "spielzug" });
      }
    },
    onPenalty: () => {
      if (!penaltyDisabled) {
        openSheet({ kind: "penalty" });
      }
    },
    onTime: () => {
      if (!composerDisabled) {
        openSheet({ kind: "series", mode: "time" });
      }
    },
    onFirstDown: () => {
      if (!composerDisabled) {
        tapSeriesTile("first", true);
      }
    },
    onTurnover: () => {
      if (!composerDisabled) {
        tapSeriesTile("turnover", true);
      }
    },
    onSafety: () => {
      if (!composerDisabled) {
        openSheet({ kind: "more", mode: "safety" });
      }
    },
    onSwitchPossession: () => {
      if (
        opponentName !== null &&
        !posting &&
        !possessionPending &&
        !halftimePending
      ) {
        void takePossession(opponentName);
      }
    },
    onUndo: () => {
      const newest = rows.find((row) => !row.isDeleted && !isMarker(row));
      if (newest !== undefined) {
        void undo(newest);
      }
    },
  });

  return (
    <TrackingPanels
      armed={armed}
      answerPat={answerPat}
      arm={arm}
      backSheet={backSheet}
      breakStartedAt={breakStartedAt}
      canRelease={canRelease}
      closeSheet={closeSheet}
      composerDisabled={composerDisabled}
      confirmation={confirmation}
      drained={drained}
      drive={drive}
      editing={editing}
      finish={finish}
      finished={finished}
      finishBlocked={finishBlocked}
      gamedayName={gamedayName}
      game={game}
      geometry={geometry}
      leagueLabel={leagueLabel}
      half={half}
      halftimeDisabled={halftimeDisabled}
      halftimeError={halftimeError}
      halftimeOpen={halftimeOpen}
      halftimePending={halftimePending}
      log={log}
      logTeamName={logTeamName}
      officialLog={officialLog}
      officials={officials}
      officialsUnavailable={officialsUnavailable}
      onBack={onBack}
      onLogout={onLogout}
      openEdit={openEdit}
      openSheet={openSheet}
      openSinglePat={openSinglePat}
      opponentName={opponentName}
      opponentSide={opponentSide}
      overtime={overtime}
      patBusy={patBusy}
      patDefense={patDefense}
      patDefenseJersey={patDefenseJersey}
      patDefensePlayers={patDefensePlayers}
      patError={patError}
      patFirst={patFirst}
      penaltyDisabled={penaltyDisabled}
      patJersey={patJersey}
      patMiss={patMiss}
      patPlayers={patPlayers}
      patQb={patQb}
      patSide={patSide}
      patSideOf={patSideOf}
      patTry={patTry}
      pickFromSpielzug={pickFromSpielzug}
      pendingPat={pendingPat}
      people={people}
      possession={possession}
      possessionError={possessionError}
      possessionName={possessionName}
      possessionPending={possessionPending}
      possessionSide={possessionSide}
      possessionTimeouts={possessionTimeouts}
      posting={posting}
      quick={quick}
      quickError={quickError}
      readOnly={readOnly}
      recentJerseys={recentJerseys}
      replacing={replacing}
      roster={roster}
      rows={rows}
      rules={rules}
      setEditing={setEditing}
      setHalftimeError={setHalftimeError}
      setHalftimeOpen={setHalftimeOpen}
      setPatDefense={setPatDefense}
      setPatDefenseJersey={setPatDefenseJersey}
      setPatError={setPatError}
      setPatJersey={setPatJersey}
      setPatMiss={setPatMiss}
      setPatQb={setPatQb}
      setPatTry={setPatTry}
      setTimeoutTeam={setTimeoutTeam}
      setup={setup}
      sheet={sheet}
      sheetHistory={sheetHistory}
      staleSince={staleSince}
      startHalftime={startHalftime}
      startOvertime={startOvertime}
      startSecondHalf={startSecondHalf}
      status={status}
      submit={submit}
      submitEdit={submitEdit}
      submitPlay={submitPlay}
      submitSeries={submitSeries}
      submitTouchdown={submitTouchdown}
      takePossession={takePossession}
      takeTimeout={takeTimeout}
      tapSeriesTile={tapSeriesTile}
      timeoutTeam={timeoutTeam}
      timeouts={timeouts}
      timeoutsPerHalf={timeoutsPerHalf}
      touchdownGain={touchdownGain}
      touchdownLabel={touchdownLabel}
      trySpot={trySpot}
      undo={undo}
      undoError={undoError}
      undoKey={undoKey}
      undoQuick={undoQuick}
      unsportsmanlike={unsportsmanlike}
      writeDefensiveTry={writeDefensiveTry}
      writeMissedPat={writeMissedPat}
      writePat={writePat}
    />
  );
}
