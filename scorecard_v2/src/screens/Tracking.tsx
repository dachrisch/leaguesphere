import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
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
import { confirmTap, useWakeLock } from "../app/sideline";
import AppHeader from "../components/AppHeader";
import EventLog, {
  logRows,
  undoBody,
  type LogRow,
} from "../components/EventLog";
import ScoreHeader, { isPossessing } from "../components/ScoreHeader";
import SnapshotHint from "../components/SnapshotHint";
import SyncBadge, { pauseReason, SyncDetails } from "../components/SyncBadge";
import {
  ArrowRight,
  Check,
  Clock,
  Flag,
  Football,
  Interception,
  Pause,
  PlusCircle,
  Shield,
  Stopwatch,
  SwapArrows,
  type IconProps,
} from "../components/icons";
import MoreSheet, { type MoreMode } from "../components/sheets/MoreSheet";
import PenaltySheet from "../components/sheets/PenaltySheet";
import SeriesSheet, {
  seriesEvent,
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

type Side = RosterPlayer["side"];

/** The open sheet: the touchdown entry, a series/time entry, or a more event. */
type SheetState =
  | { kind: "touchdown" }
  | { kind: "series"; mode: SeriesMode }
  | { kind: "penalty" }
  | { kind: "more"; mode: MoreMode };

/**
 * The series/time tiles of the composer grid. `oneTap` entries need no input
 * and save on the tap; the toast offers undo (and, where the entry may name a
 * player, adding the jersey afterwards). The others open their sheet: an
 * interception is credited to the defender, which only a sheet opened
 * *before* the possession flip can get right, and the clocks need a time.
 */
const SERIES_TILES: {
  mode: SeriesMode;
  label: string;
  Icon: ComponentType<IconProps>;
  oneTap: boolean;
}[] = [
  { mode: "first", label: "1st Down", Icon: ArrowRight, oneTap: true },
  { mode: "turnover", label: "Turnover", Icon: SwapArrows, oneTap: true },
  {
    mode: "interception",
    label: "Interception",
    Icon: Interception,
    oneTap: false,
  },
  { mode: "time", label: "Spielzeit", Icon: Stopwatch, oneTap: false },
  { mode: "timeout", label: "Auszeit", Icon: Clock, oneTap: false },
];

/** The log's event name for each one-tap entry, to find the row it wrote. */
const ONE_TAP_EVENT: Partial<Record<SeriesMode, string>> = {
  first: "First Down",
  turnover: "Turnover",
};

/**
 * Header title: the field and the round, the two facts an official needs to be
 * sure they opened the right game. `standing` stands in when a game carries no
 * stage (designer-built rows often only have the bracket label).
 */
export function trackingTitle(game: Game): string {
  const stage = game.stage.trim() || game.standing.trim();
  return stage === "" ? `Feld ${game.field}` : `Feld ${game.field} · ${stage}`;
}

/** Header context: gameday and league, each part optional. */
export function trackingSubtitle(
  gamedayName?: string,
  leagueLabel?: string,
): string | undefined {
  const parts = [gamedayName?.trim(), leagueLabel?.trim()].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return parts.length === 0 ? undefined : parts.join(" · ");
}

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
  // Written after the try, once the touchdown already handed the ball over.
  "1-Extra-Punkt",
  "2-Extra-Punkte",
]);

/** Whether a successful write hands the ball to the other team. */
export function flipsPossession(events: GameLogEventInput[]): boolean {
  // A touchdown hands the ball over even when an older client sent its
  // conversion in the same submission.
  if (events.some((event) => event.name === "Touchdown")) {
    return true;
  }
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
   * The setup read itself: the first possession decides who starts the second
   * half. The half-time awaits it (it resolved long before, normally) instead
   * of reading a state update that may not have landed yet; a failed read
   * resolves `null` and the half-time falls back to handing the ball to the
   * other team.
   */
  const setupLoad = useRef<Promise<GameSetup | null | undefined> | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [posting, setPosting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  /** The one-tap entry the toast can still undo or complete, if any. */
  const [quick, setQuick] = useState<SeriesMode | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  /**
   * The touchdown whose extra point is still open: asked once the try has
   * been played, credited to the scoring team with the scorer's jersey.
   */
  const [pendingPat, setPendingPat] = useState<{
    team: string;
    jersey: number;
  } | null>(null);
  const [patBusy, setPatBusy] = useState(false);
  /** The try's first answer: focus lands here when the touchdown tile gives way. */
  const patFirst = useRef<HTMLButtonElement>(null);
  const [patError, setPatError] = useState<string | null>(null);
  const [finishBlocked, setFinishBlocked] = useState(false);
  /** The one-tap row a jersey sheet replaces once it saves. */
  const [replacing, setReplacing] = useState<LogRow | null>(null);
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
  // A tracked game keeps the screen on: the referee looks away for a whole
  // series, and an unlock with gloves or wet hands costs the next entry.
  useWakeLock(!finished);

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
    // Read once, long before the half-time: the setup holds the opening
    // possession, which decides who starts the second half. A failed read
    // stays `null` and the half-time falls back to switching the ball.
    setupLoad.current = cachedGet<GameSetup>(
      snapshotKey.setup(game.id),
      `/api/game/${game.id}/setup`,
    ).catch(() => null);
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
   * ({@link flipsPossession}); the flip is a separate possession *event*
   * because the server does not move the ball for us. It is awaited so a second
   * tap cannot start from a stale possession, and a failed flip keeps the log
   * (the next reload reads the truth) while showing why.
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
    setQuick(null);
    setQuickError(null);
    const body: GameLogWrite = {
      gameId: game.id,
      team,
      half: log.isFirstHalf ? 1 : 2,
      event: events,
    };
    try {
      // Online this appends events; offline (or after a lost answer) the
      // session queues the op with its `client_id` and shows it optimistically.
      // The log read after the append is the whole log, so it replaces what is
      // on screen.
      await session.writeEvent(body);
      confirmTap();
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
   * kickoff side. The setup is read once when the screen opens, and the
   * half-time awaits that read; without a usable setup the ball simply goes to
   * the other team.
   */
  const secondHalfTeam = async (): Promise<string | null> => {
    // The read resolved when the screen opened; awaiting it only matters if the
    // half-time is tapped in the first moments of a slow connection, and then
    // it is still better than handing the ball to the wrong team. Awaiting a
    // `null` ref (the effect has not run) simply resolves to "no setup".
    const loaded = await setupLoad.current;
    return (
      secondHalfPossession(loaded, logTeamName(log.home), logTeamName(log.away)) ??
      opponentName
    );
  };

  /**
   * Halbzeit: the server writes the marker (a `period` event) and projects the
   * game into the second half; the possession switch is ours, because the
   * server keeps the first possession.
   *
   * The half is adopted from the log the append answers with, so the next write
   * belongs to the second half. A refused append (409) leaves everything as it
   * was and shows the server's `detail`.
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
      // Online an event append whose answer carries the flipped half; offline
      // the op is queued and the half flips locally so the next entry already
      // belongs to the second half.
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
    const target = await secondHalfTeam();
    if (target !== null) {
      await takePossession(target);
    }
    halftimeInFlight.current = false;
    setHalftimePending(false);
  };

  const openSheet = (next: SheetState): void => {
    setConfirmation(null);
    setQuick(null);
    setQuickError(null);
    setSheet(next);
  };

  /** The newest live row a one-tap entry wrote (rows are newest first). */
  const quickRow = (mode: SeriesMode): LogRow | null =>
    rows.find(
      (row) => !row.isDeleted && row.event === ONE_TAP_EVENT[mode],
    ) ?? null;

  /**
   * Save an entry that needs no input on the tap itself. A wrong tap is one
   * "Rückgängig" away in the toast, which is cheaper than a sheet on every
   * correct one.
   */
  const recordOneTap = async (mode: SeriesMode): Promise<void> => {
    try {
      await submit([seriesEvent(mode, null)]);
      setQuick(mode);
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

  const closeSheet = (): void => {
    setSheet(null);
    setReplacing(null);
  };

  /** The touchdown sheet's write; on success the extra point is asked next. */
  const submitTouchdown = async (events: GameLogEventInput[]): Promise<void> => {
    const team = possessionName;
    await submit(events);
    const jersey = events[0]?.player;
    if (team !== null && typeof jersey === "number") {
      setPendingPat({ team, jersey });
      setPatError(null);
      setFinishBlocked(false);
    }
  };

  /** The try's result: +1/+2 writes the conversion, 0 closes the prompt. */
  const answerPat = async (points: 0 | 1 | 2): Promise<void> => {
    if (pendingPat === null || patBusy) {
      return;
    }
    if (points === 0) {
      setPendingPat(null);
      setFinishBlocked(false);
      return;
    }
    setPatBusy(true);
    setPatError(null);
    try {
      await submit(
        [
          {
            name: points === 1 ? "1-Extra-Punkt" : "2-Extra-Punkte",
            player: pendingPat.jersey,
          },
        ],
        pendingPat.team,
      );
      setPendingPat(null);
      setFinishBlocked(false);
    } catch (failure) {
      setPatError(
        errorMessage(
          failure,
          "Der Extrapunkt konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      setPatBusy(false);
    }
  };

  useEffect(() => {
    if (pendingPat !== null) {
      patFirst.current?.focus();
    }
  }, [pendingPat]);

  /** "Spiel beenden" waits for an open extra point instead of dropping it. */
  const finish = (): void => {
    if (pendingPat !== null) {
      setFinishBlocked(true);
      return;
    }
    onFinalize(log);
  };

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

  /** A sheet that completes a one-tap entry writes the new row, then undoes the old. */
  const submitSeries = async (events: GameLogEventInput[]): Promise<void> => {
    const previous = replacing;
    await submit(events);
    if (previous !== null) {
      setReplacing(null);
      await undo(previous);
    }
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
        badge={
          <SyncBadge gameId={game.id} status={status} variant="inline" />
        }
        onBack={onBack}
        onLogout={onLogout}
        sub={trackingSubtitle(gamedayName, leagueLabel)}
        title={trackingTitle(game)}
      />
      <SyncDetails gameId={game.id} status={status} />
      <SnapshotHint updatedAt={staleSince} />
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
        possession={possession}
      />
      <div aria-label="Ballbesitz" className="possswitch" role="group">
        {(
          [
            ["home", log.home],
            ["away", log.away],
          ] as const
        ).map(([side, team]) => {
          const name = logTeamName(team);
          const pressed = isPossessing(team, possession);
          return (
            <button
              aria-pressed={pressed}
              className={`possbtn ${side}`}
              disabled={
                name === null ||
                possessionPending ||
                halftimePending ||
                finished ||
                readOnly
              }
              key={side}
              onClick={() => {
                if (name !== null) {
                  void takePossession(name);
                }
              }}
              type="button"
            >
              {name ?? "–"}
            </button>
          );
        })}
      </div>
      {possessionError === null ? null : (
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
      {/* The log owns the free height; the saved toast floats over its foot
          instead of pushing it out of view. */}
      <div className="logwrap">
        <EventLog
          disabled={halftimePending || readOnly}
          error={undoError}
          onUndo={(row) => void undo(row)}
          rows={rows}
          undoKey={undoKey}
        />
        {confirmation === null || pendingPat !== null ? null : (
          <div aria-label="Gespeichert" className="trackok" role="status">
            <span className="trackok-text">{confirmation}</span>
            {quick === null ? null : (
              <span className="trackok-actions">
                {quick === "first" ? (
                  <button
                    className="trackok-btn"
                    onClick={() => completeQuick(quick)}
                    type="button"
                  >
                    Nr. ergänzen
                  </button>
                ) : null}
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
        {quickError === null ? null : (
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
                Extrapunkt {pendingPat.team} · #{pendingPat.jersey} – Ergebnis des
                Versuchs?
              </p>
              <div className="patbar-opts">
                {(
                  [
                    [1, "+1"],
                    [2, "+2"],
                    [0, "nicht verwandelt"],
                  ] as const
                ).map(([points, label]) => (
                  <button
                    aria-pressed={false}
                    className="patbar-btn"
                    disabled={patBusy || readOnly}
                    key={label}
                    onClick={() => void answerPat(points)}
                    ref={points === 1 ? patFirst : undefined}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
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
          </button>
        )}
        {SERIES_TILES.map(({ mode, label, Icon, oneTap }) => (
          <button
            className="action"
            disabled={composerDisabled}
            key={mode}
            onClick={() =>
              oneTap
                ? void recordOneTap(mode)
                : openSheet({ kind: "series", mode })
            }
            type="button"
          >
            <Icon className="action-icon" size={20} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "penalty" })}
          type="button"
        >
          <Flag className="action-icon" size={20} />
          <span>Strafe</span>
        </button>
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "more", mode: "safety" })}
          type="button"
        >
          <Shield className="action-icon" size={20} />
          <span>Safety</span>
        </button>
        <button
          className="action"
          disabled={composerDisabled}
          onClick={() => openSheet({ kind: "more", mode: "overtime" })}
          type="button"
        >
          <PlusCircle className="action-icon" size={20} />
          <span>Overtime</span>
        </button>
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
                  <Pause size={18} />
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
              <Pause size={18} />
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
      </section>
      <footer className="trackfoot">
        <button
          className="startbtn"
          disabled={readOnly}
          onClick={finish}
          type="button"
        >
          <Check size={20} />
          Spiel beenden
        </button>
        {finishBlocked ? (
          <p className="trackerror" role="alert">
            Extrapunkt nach dem Touchdown noch offen – bitte oben eintragen
            oder „nicht verwandelt“ wählen.
          </p>
        ) : null}
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
            onSubmit={submitTouchdown}
            passcheck={game.passcheck === true}
            recent={recentJerseys}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "series" ? (
          <SeriesSheet
            key={sheet.mode}
            mode={sheet.mode}
            onClose={closeSheet}
            onSubmit={submitSeries}
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
