import {
  useRef,
  useState,
} from "react";

import type { GameRules } from "../api/rules";
import type {
  Game,
  GameLog,
  GameLogEventInput,
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
  advance,
  driveSpotText,
  driveText,
  isTurnoverOnDowns,
  spotText,
} from "../app/drive";
import {
  readQuarterback,
  setQuarterback,
} from "../app/quarterback";
import { timeoutBudget, timeoutText } from "../app/timeouts";
import AppHeader from "../components/AppHeader";
import EventLog, {
  isMarker,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader from "../components/ScoreHeader";
import { directionFromWire } from "../components/DirectionText";
import GameInfo from "../components/GameInfo";
import SnapshotHint from "../components/SnapshotHint";
import SyncBadge, { SyncDetails } from "../components/SyncBadge";
import {
  ArrowRight,
  Check,
  Clock,
  Flag,
  Football,
  Pause,
  Play,
  PlusCircle,
  Shield,
  Stopwatch,
  SwapArrows,
  User,
} from "../components/icons";
import MoreSheet from "../components/sheets/MoreSheet";
import SpielzugSheet, {
  type SpielzugPick,
} from "../components/sheets/SpielzugSheet";
import PenaltySheet from "../components/sheets/PenaltySheet";
import SeriesSheet, {
  seriesEvent,
  type SeriesMode,
} from "../components/sheets/SeriesSheet";
import JerseyPicker from "../components/JerseyPicker";
import QuarterbackPick from "../components/QuarterbackPick";
import ChallengeSheet from "../components/sheets/ChallengeSheet";
import FieldPositionSheet from "../components/sheets/FieldPositionSheet";
import PlaySheet from "../components/sheets/PlaySheet";
import EditSheet from "../components/sheets/EditSheet";
import Sheet from "../components/sheets/Sheet";
import { errorMessage } from "../components/sheets/errors";
import TouchdownSheet from "../components/sheets/TouchdownSheet";
import TimeoutSheet from "../components/sheets/TimeoutSheet";
import HalftimeSheet from "../components/sheets/HalftimeSheet";
import MissedPatSheet from "../components/sheets/MissedPatSheet";
import QuarterbackSheet from "../components/sheets/QuarterbackSheet";
import { yardsText } from "../components/sheets/yards";
import {
  createGameSession,
  type GameSession,
} from "../session/gameSession";
import { takeOver } from "../session/lock";
import { getRuntime } from "../session/runtime";
import { useArmed } from "./useArmed";
import { useTrackingShortcuts } from "./useTrackingShortcuts";
import { useTrackingLog } from "./tracking-flow/useTrackingLog";
import { usePatFlow } from "./tracking-flow/usePatFlow";
export {
  describeSaved,
  flipsPossession,
  secondHalfPossession,
  trackingSubtitle,
  trackingTitle,
  writeTeam,
} from "./tracking-flow/logic";
export { SyncStrip } from "./tracking-flow/SyncStrip";
import { SyncStrip } from "./tracking-flow/SyncStrip";
import {
  ONE_TAP_EVENT,
  addsJerseyLater,
  secondHalfPossession,
  trackingSubtitle,
  trackingTitle,
  type JerseyLater,
  type SheetState,
} from "./tracking-flow/logic";

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

  const closeSheet = (): void => {
    setSheet(null);
    setSheetHistory([]);
    setReplacing(null);
  };

  const openSheet = (next: SheetState): void => {
    disarm();
    setConfirmation(null);
    setQuick(null);
    setQuickError(null);
    if (sheet !== null) {
      setSheetHistory((history) => [...history, sheet]);
    }
    setSheet(next);
  };

  /** Back to the popup this one was opened from, or close when there is none. */
  const backSheet = (): void => {
    if (sheetHistory.length === 0) {
      closeSheet();
      return;
    }
    setSheet(sheetHistory[sheetHistory.length - 1]);
    setSheetHistory(sheetHistory.slice(0, -1));
  };

  /** A tile of the **Spielzug** sheet runs the handler its old row ran. */
  const pickFromSpielzug = (pick: SpielzugPick): void => {
    if (pick === "overtime") {
      closeSheet();
      if (overtime) {
        openSinglePat();
      } else {
        void startOvertime();
      }
      return;
    }
    if (pick === "safety") {
      openSheet({ kind: "more", mode: "safety" });
      return;
    }
    if (pick === "challenge") {
      openSheet({ kind: "challenge" });
      return;
    }
    if (pick === "fieldpos") {
      openSheet({ kind: "fieldpos" });
      return;
    }
    if (pick === "quarterback") {
      openSheet({ kind: "quarterback" });
      return;
    }
    openSheet({ kind: "series", mode: pick });
  };

  /** The newest live row a one-tap entry wrote (rows are newest first). */
  const quickRow = (mode: SeriesMode): LogRow | null =>
    rows.find(
      (row) => !row.isDeleted && row.event === ONE_TAP_EVENT[mode],
    ) ?? null;

  /**
   * Save an entry that needs no input on the tap itself. A wrong tap is one
   * "Rückgängig" away in the toast, which is cheaper than a sheet on every
   * correct one. An entry with an optional jersey then arms its tile: tapping
   * it again within the window adds the jersey, right where the official's
   * finger already is.
   */
  const recordOneTap = async (mode: SeriesMode): Promise<void> => {
    try {
      await submit([seriesEvent(mode, null)]);
      setQuick(mode);
      if (addsJerseyLater(mode)) {
        arm(mode);
      }
    } catch (failure) {
      setQuickError(
        errorMessage(
          failure,
          "Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  const undoQuick = (mode: SeriesMode): void => {
    const row = quickRow(mode);
    setQuick(null);
    setConfirmation(null);
    if (row !== null) {
      void undo(row);
    }
  };

  /** Open the entry's sheet; saving it replaces the one-tap row. */
  const completeQuick = (mode: SeriesMode): void => {
    setReplacing(quickRow(mode));
    openSheet({ kind: "series", mode });
  };

  /** A series tile, tapped or keyed: an armed tile adds the jersey. */
  const tapSeriesTile = (mode: SeriesMode, oneTap: boolean): void => {
    if (addsJerseyLater(mode) && armed === mode) {
      completeQuick(mode);
    } else if (oneTap) {
      void recordOneTap(mode);
    } else {
      openSheet({ kind: "series", mode });
    }
  };

  /**
   * A paused extra point: the touchdown's team, the scorer as the default
   * jersey (he often converts too) and the op the try's flip names, so undoing
   * the touchdown takes that flip with it.
   */
  /** Recent jerseys of the side with the ball, newest first, for the chips. */
  const recentJerseys: number[] = [];
  for (const row of rows) {
    if (
      !row.isDeleted &&
      row.player !== null &&
      row.team === possessionName &&
      !recentJerseys.includes(row.player)
    ) {
      recentJerseys.push(row.player);
    }
  }

  /**
   * A scrimmage play: `submit` writes it, then the down & distance moves on.
   *
   * The resulting state is appended to the row's text (so the log and the
   * ticker show "3rd & 4"), and a failed fourth down writes a **Turnover** row
   * that says why the ball changed hands. The row shares the play's submission
   * (and therefore its undo group), and the possession flip it triggers
   * carries that group's origin, so one undo removes the play, the turnover
   * row and the flip.
   */
  const submitPlay = async (events: GameLogEventInput[]): Promise<void> => {
    const [play, ...rest] = events;
    if (play === undefined) {
      return;
    }
    const scoringTeam = possessionName;
    const yards =
      typeof play.payload?.yards === "number" ? play.payload.yards : 0;
    const next = advance(drive, yards, geometry);
    const turnover = isTurnoverOnDowns(drive, yards, geometry);
    const detail = play.input === undefined ? "" : `${play.input} · `;
    // Safety and interception rows belong to the **defence**; the play stays
    // with the offence, so they are written in a second submission.
    const changesHands = rest.some((event) => event.payload?.defense === true);
    const written: GameLogEventInput[] = [
      { ...play, input: `${detail}${driveText(next)}${driveSpotText(next, geometry)}` },
      ...rest,
    ];
    if (turnover && !changesHands) {
      written.push({
        name: "Turnover",
        input: "4th down",
        payload: { reason: "downs" },
      });
    }
    const offense = written.filter(
      (event) => event.payload?.defense !== true,
    );
    const defense = written.filter(
      (event) => event.payload?.defense === true,
    );
    const gain =
      typeof play.payload?.yards === "number"
        ? Math.abs(play.payload.yards)
        : null;
    await submit(
      offense.map((event) =>
        // The touchdown row carries the gain of the play that scored: from the
        // spot the ball had to reach the goal line (field feedback: the log
        // shows the Raumgewinn after the entry, not only in the wizard).
        event.name === "Touchdown" &&
        gain !== null &&
        event.payload?.yards === undefined
          ? {
              ...event,
              input: event.input ?? yardsText(gain),
              payload: { ...(event.payload ?? {}), yards: gain },
            }
          : event,
      ),
    );
    // A play that scored carries its own touchdown row, so the try is asked
    // right away - the same prompt a touchdown tile produces. A team score
    // without a number still asks: the six points stand (IFAF R 8-1-1).
    const scored = offense.find((event) => event.name === "Touchdown");
    if (scored !== undefined && scoringTeam !== null) {
      const jersey =
        typeof scored.player === "number" ? scored.player : play.player;
      openPat(
        scoringTeam,
        typeof jersey === "number" ? jersey : null,
        session.lastOpId() ?? undefined,
        touchdownGroupOf(scoringTeam),
      );
    }
    if (defense.length > 0 && opponentName !== null) {
      await submit(defense, opponentName);
      // A pick six belongs to the defence, and its try follows for them.
      const defensiveScore = defense.find(
        (event) => event.name === "Touchdown",
      );
      if (defensiveScore !== undefined) {
        const jersey =
          typeof defensiveScore.player === "number"
            ? defensiveScore.player
            : null;
        openPat(
          opponentName,
          jersey,
          session.lastOpId() ?? undefined,
          touchdownGroupOf(opponentName),
        );
      }
    }
  };

  /**
   * One tap on a team's timeout: the row belongs to that team, whoever has the
   * ball (meeting 2026-11-05, 57:33-59:08). No time is asked - the date and
   * the order of the log are the record, and a typed clock would be one tap
   * more on the common path. A wrong tap is undone from its row.
   */
  const takeTimeout = async (
    team: string,
    gameTime: string | null = null,
  ): Promise<void> => {
    const event: GameLogEventInput = { name: "Auszeit" };
    if (gameTime !== null) {
      event.input = gameTime;
    }
    await submit([event], team);
  };

  /** A sheet that completes a one-tap entry writes the new row, then undoes the old. */
  const submitSeries = async (events: GameLogEventInput[]): Promise<void> => {
    const previous = replacing;
    // A replacement belongs to the replaced row's team, and the ball already
    // moved with that row (an interception): it must not move twice.
    await submit(events, previous?.team ?? undefined, {
      keepBall: previous !== null,
    });
    if (previous !== null) {
      setReplacing(null);
      // The replacement kept the ball where the replaced row left it.
      await undo(previous, { keepPossession: true });
    }
  };

  // Nothing happens between the touchdown and the try, except a penalty: a
  // foul during the try is enforced on the try itself, so the flag must stay
  // reachable while the prompt is open.
  const penaltyDisabled =
    posting ||
    possessionPending ||
    halftimePending ||
    finished ||
    readOnly ||
    possessionSide === null ||
    possessionName === null;
  const composerDisabled =
    pendingPat !== null ||
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
    pendingPat !== null ||
    halftimePending ||
    posting ||
    possessionPending ||
    undoKey !== null ||
    readOnly;

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
    <div className="app-shell tracking">
      <AppHeader
        badge={
          <SyncBadge gameId={game.id} status={status} variant="inline" />
        }
        onBack={onBack}
        onLogout={onLogout}
        sub={trackingSubtitle(gamedayName, leagueLabel)}
        title={trackingTitle(game)}
      />
      <SyncDetails gameId={game.id} status={status} withReason={false} />
      <SnapshotHint updatedAt={staleSince} />
      <SyncStrip
        canRelease={canRelease}
        deviceLog={log}
        drained={drained}
        onResume={() => void status.resume()}
        onTakeOver={async () => {
          await takeOver(game.id);
          await status.resume();
        }}
        serverLog={officialLog}
        status={status}
      />
      <main aria-label="Spiel erfassen" className="tracking-layout">
        <GameInfo
          game={game}
          log={log}
          officials={officials}
          officialsUnavailable={officialsUnavailable}
          people={people}
          setup={setup}
        />
        <div className="tracking-controls">
      <ScoreHeader
        away={officialLog.away}
        disabled={possessionPending || halftimePending || readOnly}
        home={officialLog.home}
        isFirstHalf={officialLog.isFirstHalf}
        onPossession={(team) => void takePossession(team)}
        onTimeout={(team) => setTimeoutTeam(team)}
        possession={possession}
        timeoutDisabled={
          posting ||
          possessionPending ||
          halftimePending ||
          finished ||
          readOnly
        }
        timeouts={(team) => {
          const name = logTeamName(team);
          return name === null
            ? null
            : timeoutBudget(rows, name, half, timeoutsPerHalf);
        }}
      />
      <div className="drivebar">
        <p aria-live="polite" className="driveline">
          {pendingPat === null
            ? `${driveText(drive)}${
                spotText(drive.ballOn, geometry) === null
                  ? ""
                  : ` · ${spotText(drive.ballOn, geometry)}`
              }`
            : // the try is its own down: from B5 (one point) or B10 (two),
              // moved by a penalty the log enforced during the try
              `Versuch · ${spotText(trySpot, geometry)}`}
        </p>
        <button
          className="driveset"
          disabled={readOnly || finished}
          onClick={() => openSheet({ kind: "fieldpos" })}
          type="button"
        >
          Feldposition
        </button>
      </div>
      {possessionError === null || readOnly ? null : (
        <p className="trackerror" role="alert">
          {possessionError}
        </p>
      )}
      {finished ? (
        <p className="finishednote" role="status">
          Dieses Spiel ist beendet.
        </p>
      ) : possessionName === null ? (
        <p className="trackhint">Ballbesitz wählen, um Einträge zu erfassen.</p>
      ) : null}
        </div>
      {/* The log owns the free height; the saved strip takes its own line
          below the log instead of covering the newest rows. */}
      <div className="logwrap tracking-log">
        <EventLog
          away={logTeamName(log.away)}
          disabled={halftimePending || readOnly || finished}
          error={undoError}
          home={logTeamName(log.home)}
          onEdit={readOnly || finished ? undefined : openEdit}
          onUndo={(row) => void undo(row)}
          rows={rows}
          undoKey={undoKey}
        />
        {confirmation === null || pendingPat !== null ? null : (
          <div aria-label="Gespeichert" className="trackok" role="status">
            <span className="trackok-text">{confirmation}</span>
            {quick === null ? null : (
              <span className="trackok-actions">
                <button
                  className="trackok-btn"
                  disabled={undoKey !== null}
                  onClick={() => undoQuick(quick)}
                  type="button"
                >
                  Rückgängig
                </button>
              </span>
            )}
          </div>
        )}
        {quickError === null || readOnly ? null : (
          <p className="trackerror" role="alert">
            {quickError}
          </p>
        )}
      </div>
      <section
        aria-label="Einträge"
        className={possessionSide === null ? "actions" : `actions ${possessionSide}`}
      >
        {/* The try comes before any other score: while its result is open,
            the extra point takes the touchdown button's place. */}
        {pendingPat !== null ? (
            <div
              aria-label={`Extrapunkt ${pendingPat.team}`}
              className="patbar"
              role="group"
            >
              <p className="patbar-q">
                Extrapunkt {pendingPat.team} ·{" "}
                {pendingPat.jersey === null
                  ? "ohne Nummer"
                  : `#${pendingPat.jersey}`}{" "}
                – Ergebnis des Versuchs?
              </p>
              <div className="patbar-opts">
                {(
                  [[1, "+1"], [2, "+2"], [0, "nicht verwandelt"]] as const
                ).map(([points, label]) => (
                  <button
                    aria-pressed={false}
                    className="choice choice-dark"
                    disabled={patBusy || readOnly}
                    key={label}
                    onClick={() => answerPat(points)}
                    ref={points === 1 ? patFirst : undefined}
                    type="button"
                  >
                    <span className={points === 0 ? "choice-label" : "choice-num"}>
                      {label}
                    </span>
                  </button>
                ))}
                <button
                  aria-pressed={false}
                  className="choice choice-dark"
                  disabled={patBusy || readOnly || possessionName === null}
                  onClick={() => {
                    setPatDefense(true);
                    setPatDefenseJersey(null);
                    setPatError(null);
                  }}
                  type="button"
                >
                  <span className="choice-label">Gegner +2</span>
                </button>
              </div>
              {patError === null ? null : (
                <p className="patbar-err" role="alert">
                  {patError}
                </p>
              )}
            </div>
        ) : (
          <button
            className={
              possessionSide === null ? "tdbtn" : `tdbtn ${possessionSide}`
            }
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "touchdown" })}
            type="button"
          >
            <Football className="tdbtn-icon" size={26} />
            <span className="tdbtn-label">{touchdownLabel}</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="T" />
          </button>
        )}
        <div className="action-grid">
          <button
            className="action spielzug"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "spielzug" })}
            type="button"
          >
            <Play className="action-icon" size={24} />
            <span>Spielzug</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="S" />
          </button>
          <button
            className="action"
            disabled={penaltyDisabled}
            onClick={() => openSheet({ kind: "penalty" })}
            type="button"
          >
            <Flag className="action-icon" size={20} />
            <span>Strafe</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="5" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "series", mode: "time" })}
            type="button"
          >
            <Stopwatch className="action-icon" size={20} />
            <span>Spielzeit</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="6" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => setTimeoutTeam(possessionName)}
            type="button"
          >
            <Clock className="action-icon" size={20} />
            <span>Auszeit</span>
            {possessionTimeouts === null ? null : (
              <span aria-hidden="true" className="actioncount">
                {timeoutText(possessionTimeouts)}
              </span>
            )}
          </button>
          <button
            className={armed === "first" ? "action is-armed" : "action"}
            disabled={composerDisabled}
            onClick={() => tapSeriesTile("first", true)}
            type="button"
          >
            {armed === "first" ? (
              <User className="action-icon" size={20} />
            ) : (
              <ArrowRight className="action-icon" size={20} />
            )}
            <span>{armed === "first" ? "Nr. ergänzen" : "1st Down"}</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="8" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => tapSeriesTile("turnover", true)}
            type="button"
          >
            <SwapArrows className="action-icon" size={20} />
            <span>Turnover</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="9" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "more", mode: "safety" })}
            type="button"
          >
            <Shield className="action-icon" size={20} />
            <span>Safety</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="0" />
          </button>
          <button
            className={armed === "overtime" ? "action is-armed" : "action"}
            disabled={composerDisabled}
            onClick={() => {
              if (overtime) {
                openSinglePat();
              } else if (armed === "overtime") {
                void startOvertime();
              } else {
                arm("overtime");
              }
            }}
            type="button"
          >
            <PlusCircle className="action-icon" size={20} />
            <span>
              {overtime
                ? "+1 XP"
                : armed === "overtime"
                  ? "Overtime starten"
                  : "Overtime"}
            </span>
          </button>
        </div>
      </section>
        <div
          aria-label="Spielabschluss"
          className={
            possessionSide === null
              ? "tracking-end"
              : `tracking-end ${possessionSide}`
          }
          role="group"
        >
        {log.isFirstHalf && !finished ? (
        <section aria-label="Halbzeit" className="halfblock">
          <button
            className="halfbtn"
            disabled={halftimeDisabled}
            onClick={() => {
              setHalftimeError(null);
              setHalftimeOpen(true);
            }}
            type="button"
          >
            <Pause size={18} />
            {halftimePending ? "Halbzeit …" : "Halbzeit"}
          </button>
          {halftimeError === null || halftimeOpen ? null : (
            <p className="trackerror" role="alert">
              {halftimeError}
            </p>
          )}
        </section>
      ) : breakStartedAt !== null && !finished ? (
        // The break lives in its dialog; this only reopens it without putting
        // a second countdown next to "Spiel beenden".
        <section aria-label="Halbzeitpause" className="halfblock">
          <button
            className="halfbtn"
            onClick={() => setHalftimeOpen(true)}
            type="button"
          >
            <Pause size={18} />
            Pause
          </button>
        </section>
      ) : null}
      <footer className="trackfoot">
        {finished ? null : (
          <button
            className="startbtn"
            disabled={readOnly}
            onClick={finish}
            type="button"
          >
            <Check size={20} />
            Spiel beenden
          </button>
        )}
        {finishBlocked ? (
          <p className="trackerror" role="alert">
            Extrapunkt nach dem Touchdown noch offen – bitte oben eintragen
            oder „nicht verwandelt“ wählen.
          </p>
        ) : null}
      </footer>
        </div>
        <p aria-live="polite" className="sr-only">
          {armed === "overtime"
            ? "Zum Bestätigen erneut tippen"
            : ""}
        </p>
      </main>

      {patTry !== null ? (
        <Sheet
          busy={patBusy}
          error={patError}
          footer={
            <button
              className="startbtn"
              disabled={patBusy || readOnly}
              onClick={() => {
                void writePat(patJersey);
              }}
              type="button"
            >
              {patBusy ? "Speichern …" : "Speichern"}
            </button>
          }
          onBack={() => {
            setPatTry(null);
            setPatError(null);
          }}
          onClose={() => {
            setPatTry(null);
            setPatError(null);
          }}
          title={`Extrapunkt ${patTry.team}`}
        >
          <p className="sheetnote">
            {patTry.defaultJersey === null
              ? "Wer hat den Extrapunkt verwandelt?"
              : `Wer hat den Extrapunkt verwandelt? Der Touchdown-Schütze ist vorausgewählt (#${patTry.defaultJersey}).`}
          </p>
          <JerseyPicker
            disabled={patBusy || readOnly}
            groupLabel="Trikotnummer Extrapunkt"
            label="Trikot"
            onChange={setPatJersey}
            optionalLabel="Ohne Nummer"
            players={patPlayers}
            strict={game.passcheck === true}
            value={patJersey}
          />
          <h3 className="sheetsection">Quarterback</h3>
          <QuarterbackPick
            disabled={patBusy || readOnly}
            onChange={setPatQb}
            roster={roster}
            side={patSide}
            value={patQb}
          />
        </Sheet>
      ) : null}

      {patDefense ? (
        <Sheet
          busy={patBusy}
          error={patError}
          footer={
            <button
              className="startbtn"
              disabled={patBusy || readOnly}
              onClick={() => {
                void writeDefensiveTry(patDefenseJersey);
              }}
              type="button"
            >
              {patBusy ? "Speichern …" : "Speichern"}
            </button>
          }
          onBack={() => {
            setPatDefense(false);
            setPatError(null);
          }}
          onClose={() => {
            setPatDefense(false);
            setPatError(null);
          }}
          title={`Gegner +2 · ${opponentName ?? "Gegner"}`}
        >
          <p className="sheetnote">
            Wer hat den Punkt für {opponentName ?? "Gegner"} erzielt? Ohne
            Nummer zählt der Punkt fürs Team.
          </p>
          <JerseyPicker
            disabled={patBusy || readOnly}
            groupLabel="Trikotnummer Gegner"
            label="Trikot"
            onChange={setPatDefenseJersey}
            optionalLabel="Ohne Nummer"
            players={patDefensePlayers}
            strict={game.passcheck === true}
            value={patDefenseJersey}
          />
        </Sheet>
      ) : null}

      {patMiss !== null ? (
        <MissedPatSheet
          initialJersey={patMiss.defaultJersey}
          lastQuarterback={patQb}
          onBack={() => setPatMiss(null)}
          onClose={() => setPatMiss(null)}
          onSubmit={writeMissedPat}
          opponentName={opponentName ?? "Gegner"}
          roster={roster}
          side={patSideOf(patMiss.team)}
          teamName={patMiss.team}
        />
      ) : null}

      {editing !== null ? (
        <EditSheet
          // A second edit of another row starts from that row, not the last one.
          key={editing.key}
          event={editing.event}
          half={editing.half}
          input={editing.input}
          jersey={editing.player}
          payload={editing.payload}
          onSubmit={submitEdit}
          onClose={() => setEditing(null)}
          roster={roster}
          side={
            editing.team !== null && editing.team === log.away.name
              ? "away"
              : "home"
          }
          teamName={editing.team ?? "–"}
        />
      ) : null}

      {sheet !== null &&
      possessionSide !== null &&
      possessionName !== null &&
      (sheet.kind === "touchdown" ||
        sheet.kind === "series" ||
        sheet.kind === "quarterback" ||
        sheet.kind === "spielzug" ||
        opponentName !== null) ? (
        sheet.kind === "play" ? (
          <PlaySheet
            drive={drive}
            geometry={geometry}
            initialResult={sheet.result}
            initialType={sheet.type}
            lastQuarterback={readQuarterback(game.id, possessionSide)}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={submitPlay}
            opponentName={opponentName ?? "Gegner"}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "fieldpos" ? (
          <FieldPositionSheet
            ballOn={drive.ballOn}
            down={drive.down}
            goal={drive.goal}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={(event) => submit([event])}
            teamName={possessionName}
          />
        ) : sheet.kind === "challenge" ? (
          <ChallengeSheet
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={(event) => submit([event])}
            teamName={possessionName}
          />
        ) : sheet.kind === "touchdown" ? (
          <TouchdownSheet
            gain={touchdownGain}
            onClose={closeSheet}
            onSubmit={submitTouchdown}
            passcheck={game.passcheck === true}
            recent={recentJerseys}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "series" ? (
          // Completing a one-tap interception: the defender already has the
          // ball, so the sheet sees the possession from before the tap.
          replacing !== null &&
          sheet.mode === "interception" &&
          opponentName !== null &&
          opponentSide !== null ? (
            <SeriesSheet
              key={sheet.mode}
              half={half}
              mode={sheet.mode}
              onBack={sheetHistory.length > 0 ? backSheet : undefined}
              onClose={closeSheet}
              onSubmit={submitSeries}
              opponentName={possessionName}
              perHalf={timeoutsPerHalf}
              roster={roster}
              side={opponentSide}
              teamName={opponentName}
              timeouts={timeouts}
            />
          ) : (
            <SeriesSheet
              key={sheet.mode}
              half={half}
              mode={sheet.mode}
              onBack={sheetHistory.length > 0 ? backSheet : undefined}
              onClose={closeSheet}
              onSubmit={submitSeries}
              opponentName={opponentName ?? "–"}
              perHalf={timeoutsPerHalf}
              roster={roster}
              side={possessionSide}
              teamName={possessionName}
              timeouts={timeouts}
            />
          )
        ) : sheet.kind === "penalty" ? (
          <PenaltySheet
            ballOn={drive.ballOn}
            history={unsportsmanlike}
            rules={rules}
            onClose={closeSheet}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "quarterback" ? (
          <QuarterbackSheet
            onClose={closeSheet}
            onSubmit={(jersey) =>
              setQuarterback(game.id, possessionSide, jersey)
            }
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
            value={readQuarterback(game.id, possessionSide)}
          />
        ) : sheet.kind === "spielzug" ? (
          <SpielzugSheet
            disabled={composerDisabled}
            onClose={closeSheet}
            onPick={pickFromSpielzug}
            onPlay={(type, result) =>
              openSheet({ kind: "play", type, result })
            }
          />
        ) : (
          <MoreSheet
            key={sheet.mode}
            mode={sheet.mode}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        )
      ) : null}

      {halftimeOpen ? (
        <HalftimeSheet
          away={logTeamName(officialLog.away) ?? "–"}
          awayScore={officialLog.away.score}
          busy={halftimePending}
          direction={(() => {
            const first = directionFromWire(setup?.direction ?? undefined);
            return first === "Nord" ? "Süd" : first === "Süd" ? "Nord" : null;
          })()}
          disabled={halftimeDisabled}
          error={halftimeError}
          home={logTeamName(officialLog.home) ?? "–"}
          homeScore={officialLog.home.score}
          intermissionMinutes={
            rules?.periods?.intermission_minutes ?? 2
          }
          onClose={() => setHalftimeOpen(false)}
          onSecondHalf={startSecondHalf}
          onStart={() => void startHalftime()}
          possession={
            secondHalfPossession(
              setup,
              logTeamName(log.home),
              logTeamName(log.away),
            ) ?? opponentName
          }
          setup={setup}
          startedAt={breakStartedAt}
        />
      ) : null}

      {timeoutTeam !== null ? (
        <TimeoutSheet
          disabled={readOnly}
          half={half}
          key={timeoutTeam}
          onSubmit={(gameTime) => takeTimeout(timeoutTeam, gameTime)}
          onClose={() => setTimeoutTeam(null)}
          onTeam={(team) => setTimeoutTeam(team)}
          opponentName={
            timeoutTeam === possessionName ? opponentName : possessionName
          }
          perHalf={timeoutsPerHalf}
          seconds={rules?.timeouts?.seconds ?? 60}
          teamName={timeoutTeam}
          timeouts={timeouts}
          used={
            timeoutBudget(rows, timeoutTeam, half, timeoutsPerHalf).used
          }
        />
      ) : null}
    </div>
  );
}
