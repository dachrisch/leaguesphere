import {
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type {
  Game,
  GameLog,
  GameLogEventInput,
  GameLogWrite,
  GameSetup,
  RosterPlayer,
} from "../../api/types";
import type { GameRules } from "../../api/rules";
import { forgetBreak, rememberBreakStart } from "../../app/break";
import { driveAfter, geometryOf, TRY_ONE, TRY_TWO } from "../../app/drive";
import { readQuarterback, rememberQuarterback } from "../../app/quarterback";
import { confirmTap } from "../../app/sideline";
import { timeoutBudget } from "../../app/timeouts";
import { logRows, type LogRow } from "../../components/EventLog";
import { errorMessage, IgnoredWrite } from "../../components/sheets/errors";
import { undoPossessionTeamOfGroup } from "../../session/possessionUndo";
import type { GameSession } from "../../session/gameSession";
import type { Side } from "./logic";
import {
  describeSaved,
  flipsPossession,
  secondHalfPossession,
  writeTeam,
} from "./logic";

type PendingPat = {
  team: string;
  jersey: number | null;
  originId?: string;
  group?: number | null;
};
type PatTry = { team: string; points: 1 | 2; defaultJersey: number | null };
type PatMiss = { team: string; defaultJersey: number | null };
type Dispatcher<T> = Dispatch<SetStateAction<T>>;

interface UsePatFlowArgs {
  game: Game;
  session: GameSession;
  log: GameLog;
  rows: LogRow[];
  geometry: ReturnType<typeof geometryOf>;
  rules: GameRules | null;
  roster: RosterPlayer[] | null;
  setupLoadRef: MutableRefObject<Promise<GameSetup | null | undefined> | null>;
  logTeamName: (team: GameLog["home"]) => string | null;
  possessionName: string | null;
  opponentName: string | null;
  possessionSide: Side | null;
  takePossession: (teamName: string, originId?: string) => Promise<void>;
  possessionInFlightRef: MutableRefObject<boolean>;
  halftimeInFlightRef: MutableRefObject<boolean>;
  postInFlightRef: MutableRefObject<boolean>;
  pendingPat: PendingPat | null;
  setPendingPat: Dispatcher<PendingPat | null>;
  patTry: PatTry | null;
  setPatTry: Dispatcher<PatTry | null>;
  patMiss: PatMiss | null;
  setPatMiss: Dispatcher<PatMiss | null>;
  patDefense: boolean;
  setPatDefense: Dispatcher<boolean>;
  patDefenseJersey: number | null;
  setPatDefenseJersey: Dispatcher<number | null>;
  patJersey: number | null;
  setPatJersey: Dispatcher<number | null>;
  patQb: number | null;
  setPatQb: Dispatcher<number | null>;
  patBusy: boolean;
  setPatBusy: Dispatcher<boolean>;
  patFirst: MutableRefObject<HTMLButtonElement | null>;
  patOriginRef: MutableRefObject<{ team: string; originId?: string } | null>;
  patError: string | null;
  setPatError: Dispatcher<string | null>;
  finishBlocked: boolean;
  setFinishBlocked: Dispatcher<boolean>;
  halftimePending: boolean;
  setHalftimePending: Dispatcher<boolean>;
  halftimeError: string | null;
  setHalftimeError: Dispatcher<string | null>;
  setHalftimeOpen: Dispatcher<boolean>;
  breakStartedAt: number | null;
  setBreakStartedAt: Dispatcher<number | null>;
  setPosting: Dispatcher<boolean>;
  setConfirmation: Dispatcher<string | null>;
  setQuick: (value: null) => void;
  setQuickError: Dispatcher<string | null>;
  readOnly: boolean;
  finished: boolean;
  stopReason: string | null;
  disarm: () => void;
  onFinalize: (log: GameLog) => void;
}

/** Drive/PAT/timeouts, submit, halftime and the finish gate. */
export function usePatFlow({
  game,
  session,
  log,
  rows,
  geometry,
  rules,
  roster,
  setupLoadRef,
  logTeamName,
  possessionName,
  opponentName,
  possessionSide,
  takePossession,
  possessionInFlightRef,
  halftimeInFlightRef,
  postInFlightRef,
  pendingPat,
  setPendingPat,
  patTry,
  setPatTry,
  patMiss,
  setPatMiss,
  patDefense: _patDefense,
  setPatDefense,
  patDefenseJersey: _patDefenseJersey,
  setPatDefenseJersey,
  patJersey: _patJersey,
  setPatJersey,
  patQb,
  setPatQb,
  patBusy,
  setPatBusy,
  patFirst,
  patOriginRef,
  patError: _patError,
  setPatError,
  finishBlocked: _finishBlocked,
  setFinishBlocked,
  halftimePending: _halftimePending,
  setHalftimePending,
  halftimeError: _halftimeError,
  setHalftimeError,
  setHalftimeOpen,
  breakStartedAt: _breakStartedAt,
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
}: UsePatFlowArgs) {
  void _patDefense;
  void _patDefenseJersey;
  void _patJersey;
  void _patError;
  void _finishBlocked;
  void _halftimePending;
  void _halftimeError;
  void _breakStartedAt;

  const drive = useMemo(
    () => driveAfter(rows, geometry, possessionName),
    [rows, geometry, possessionName],
  );
  /**
   * The spot of the open try: B5 for one point, B10 for two, moved by a penalty
   * the log enforced since the touchdown. `drive.ballOn` carries the enforced
   * spot, but a stale log read can still show the pre-touchdown series, so the
   * delta only applies while the drive really is a try.
   */
  const trySpot = ((): number => {
    const points = patTry?.points === 2 ? 2 : 1;
    const base = geometry.fieldLength - (points === 2 ? TRY_TWO : TRY_ONE);
    if (drive.phase !== "try" || drive.ballOn === null) {
      return base;
    }
    return base + (drive.ballOn - (geometry.fieldLength - TRY_ONE));
  })();
  /** A marker in the log, so the tile flips to +1 XP after every reload. */
  const overtime = rows.some(
    (row) => !row.isDeleted && row.event === "Overtime startet",
  );

  /**
   * What a touchdown from the current spot is worth: the yards left to the
   * goal line. The touchdown sheet pre-fills its yards field with it, so the
   * row shows the Raumgewinn even when the official just confirms.
   */
  const touchdownGain =
    drive.ballOn === null
      ? null
      : Math.max(0, geometry.fieldLength - drive.ballOn);

  /**
   * Start overtime: a marker event, no score and no new half. The tile then
   * offers **+1 XP** next to the touchdown, as the rules ask.
   */
  const startOvertime = async (): Promise<void> => {
    try {
      await submit([{ name: "Overtime starten" }]);
    } catch (failure) {
      setQuickError(
        errorMessage(
          failure,
          "Die Overtime konnte nicht gestartet werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  /** The side a team name belongs to (the try's jersey list and QB memory). */
  const patSideOf = (team: string): Side =>
    team === log.away.name ? "away" : "home";
  /** The side that scored the try: its roster feeds the jersey step. */
  const patSide: Side =
    pendingPat === null ? "home" : patSideOf(pendingPat.team);
  const patPlayers =
    roster === null
      ? []
      : roster.filter((player) => player.side === patSide);
  /** The defence on the try: the side that did not score the touchdown. */
  const patDefensePlayers =
    roster === null
      ? []
      : roster.filter((player) => player.side !== patSide);

  const half = log.isFirstHalf ? 1 : 2;
  // The definition may be missing, stale or not a definition at all (a test
  // double, an old server): the shipped values win over a crash.
  const timeoutsPerHalf = rules?.timeouts?.per_half ?? 2;
  /** The side with the ball and what is left of its timeouts this half. */
  const possessionTimeouts =
    possessionName === null
      ? null
      : timeoutBudget(rows, possessionName, half, timeoutsPerHalf);

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
    {
      /** The ball already moved with the row this write replaces. */
      keepBall = false,
      /**
       * The op the following possession flip belongs to. The try's flip names
       * the touchdown, so undoing the touchdown takes its flip with it even
       * though the conversion was a later write.
       */
      flipOrigin,
    }: { keepBall?: boolean; flipOrigin?: string } = {},
  ): Promise<void> => {
    if (postInFlightRef.current) {
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
    postInFlightRef.current = true;
    setPosting(true);
    disarm();
    setConfirmation(null);
    setQuick(null);
    setQuickError(null);
    const body: GameLogWrite = {
      gameId: game.id,
      team,
      // Overtime is the third period: it stays inside the second half's block
      // for every reader, but the event store keeps the distinction.
      half: overtime ? 3 : log.isFirstHalf ? 1 : 2,
      event: events,
    };
    try {
      // Online this appends events; offline (or after a lost answer) the
      // session queues the op with its `client_id` and shows it optimistically.
      // The log read after the append is the whole log, so it replaces what is
      // on screen.
      await session.writeEvent(body);
      // The flip written below belongs to this entry, so undoing the row can
      // take exactly that op with it.
      const origin = flipOrigin ?? session.lastOpId() ?? undefined;
      const qb = events.find((event) => typeof event.payload?.qb === "number")
        ?.payload?.qb;
      if (typeof qb === "number" && possessionSide !== null) {
        rememberQuarterback(game.id, possessionSide, qb);
      }
      confirmTap();
      setConfirmation(describeSaved(events));
      if (!keepBall && flipsPossession(events) && opponentName !== null) {
        await takePossession(opponentName, origin);
      }
    } finally {
      postInFlightRef.current = false;
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
    const loaded = await setupLoadRef.current;
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
    if (halftimeInFlightRef.current || !log.isFirstHalf || readOnly) {
      return;
    }
    if (possessionInFlightRef.current) {
      // Without this the flip below would silently do nothing and the second
      // half would start with whoever the manual change left in possession.
      setHalftimeError(
        "Der Ballbesitz wird gerade geändert. Bitte kurz warten.",
      );
      return;
    }
    halftimeInFlightRef.current = true;
    setHalftimePending(true);
    setHalftimeError(null);
    disarm();
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
      halftimeInFlightRef.current = false;
      setHalftimePending(false);
      return;
    }
    setBreakStartedAt(rememberBreakStart(game.id));
    const target = await secondHalfTeam();
    if (target !== null) {
      await takePossession(target);
    }
    halftimeInFlightRef.current = false;
    setHalftimePending(false);
    // The dialog stays open: its countdown is the break now.
  };

  /** "2. Halbzeit starten": the break is over, back to the running game. */
  const startSecondHalf = (): void => {
    forgetBreak(game.id);
    setBreakStartedAt(null);
    setHalftimeOpen(false);
  };


  const openPat = (
    team: string,
    jersey: number | null,
    originId?: string,
    group?: number | null,
  ): void => {
    setPendingPat({ team, jersey, originId, group: group ?? null });
    setPatTry(null);
    setPatMiss(null);
    setPatDefense(false);
    setPatDefenseJersey(null);
    setPatJersey(null);
    setPatQb(readQuarterback(game.id, patSideOf(team)));
    setPatError(null);
    setFinishBlocked(false);
  };

  /**
   * The submission the just-written touchdown belongs to.
   *
   * Read from the log the write answered with: `TeamLog.sequence` names the
   * submission, and it is what tells the undo of that entry (the official may
   * tap the play row instead of the touchdown) from the undo of an older
   * score.
   */
  const touchdownGroupOf = (team: string): number | null => {
    const fresh = logRows(session.getLog());
    const touchdown = fresh.find(
      (entry) =>
        !entry.isDeleted &&
        entry.event === "Touchdown" &&
        entry.team === team &&
        entry.groupSequence !== 0,
    );
    return touchdown === undefined ? null : touchdown.groupSequence;
  };

  /**
   * The touchdown sheet's write; on success the extra point is asked next —
   * also for a team touchdown entered without a number (IFAF R 8-1-1).
   */
  const submitTouchdown = async (events: GameLogEventInput[]): Promise<void> => {
    // `submit` refuses a write without a possession team (writeTeam throws),
    // so by the time it resolves `possessionName` is never null. The old
    // `if (team !== null)` wrapper could not run and carried no behaviour.
    const team = possessionName;
    await submit(events);
    // The touchdown does not flip the ball any more; its op is what the try's
    // flip will name so undoing the touchdown takes the flip with it.
    const originId = session.lastOpId() ?? undefined;
    const jersey = events[0]?.player;
    openPat(
      team as string,
      typeof jersey === "number" ? jersey : null,
      originId,
      touchdownGroupOf(team as string),
    );
  };

  /** Forget the open try (a miss, a saved conversion, a new touchdown). */
  const closePat = (): void => {
    setPendingPat(null);
    setPatTry(null);
    setPatMiss(null);
    setPatDefense(false);
    setPatDefenseJersey(null);
    setPatJersey(null);
    setPatQb(null);
    setFinishBlocked(false);
  };

  /** The op a written try's flip behind it names, for a later undo. */
  const rememberPatOrigin = (): void => {
    patOriginRef.current =
      pendingPat === null
        ? null
        : { team: pendingPat.team, originId: pendingPat.originId };
  };

  /**
   * Ask again after an undone conversion: the scorer mis-tapped the result, so
   * the same prompt comes back — same team, same default jersey, same flip
   * origin — as long as the touchdown it belongs to is still in the log.
   */
  const reopenPat = (tryRow: LogRow, keepPossession: boolean): void => {
    if (keepPossession) {
      // An in-place correction already wrote the replacement; it is no mis-tap.
      return;
    }
    // The try's own row names the team the ball goes back to: the offence that
    // scored, also for a defensive try (which is credited to the defence).
    const team = undoPossessionTeamOfGroup(tryRow, rows, log);
    if (team === null) {
      return;
    }
    const fresh = logRows(session.getLog());
    const touchdown =
      fresh.find(
        (entry) =>
          !entry.isDeleted &&
          entry.event === "Touchdown" &&
          entry.team === team,
      ) ?? null;
    if (touchdown === null) {
      return;
    }
    const remembered = patOriginRef.current;
    openPat(
      team,
      touchdown.player ?? tryRow.player,
      remembered !== null && remembered.team === team
        ? remembered.originId
        : undefined,
      touchdown.groupSequence,
    );
  };

  /** Write the conversion for the chosen jersey, or for nobody. */
  const writePat = async (jersey: number | null): Promise<void> => {
    if (patTry === null || patBusy) {
      return;
    }
    setPatBusy(true);
    setPatError(null);
    try {
      const event: GameLogEventInput = {
        name: patTry.points === 1 ? "1-Extra-Punkt" : "2-Extra-Punkte",
      };
      if (jersey !== null) {
        event.player = jersey;
      }
      if (patQb !== null) {
        event.payload = { qb: patQb };
      }
      rememberPatOrigin();
      await submit([event], patTry.team, {
        flipOrigin: pendingPat?.originId,
      });
      closePat();
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

  /**
   * "nicht verwandelt": the try is over, but the record is not. The sheet asks
   * the same facts an incomplete pass does (all optional), so the miss is a
   * row with value 0 instead of nothing at all.
   */
  const writeMissedPat = async (
    events: GameLogEventInput[],
  ): Promise<void> => {
    if (patMiss === null || pendingPat === null || patBusy) {
      throw new IgnoredWrite("Der Extrapunkt wird gerade gespeichert.");
    }
    setPatBusy(true);
    try {
      rememberPatOrigin();
      await submit(events, patMiss.team, {
        flipOrigin: pendingPat.originId,
      });
      closePat();
    } finally {
      setPatBusy(false);
    }
  };

  /**
   * The try's result. `nicht verwandelt` opens the miss step (its flip is
   * written with the row), +1/+2 open the jersey step, pre-selected with the
   * touchdown's scorer.
   */
  const answerPat = (points: 0 | 1 | 2): void => {
    if (pendingPat === null || patBusy) {
      return;
    }
    if (points === 0) {
      // The prompt stays behind the sheet: closing the miss step without
      // saving returns to the result choice.
      setPatMiss({
        team: pendingPat.team,
        defaultJersey: pendingPat.jersey,
      });
      setPatError(null);
      return;
    }
    setPatTry({
      team: pendingPat.team,
      points,
      defaultJersey: pendingPat.jersey,
    });
    setPatJersey(pendingPat.jersey);
    setPatQb(readQuarterback(game.id, patSideOf(pendingPat.team)));
    setPatError(null);
  };

  /**
   * The defence scored on the try (IFAF R 8-1-1: two points).
   *
   * The row goes to the **defending** team, i.e. the opponent of the side that
   * scored the touchdown - the ball still belongs to the scoring team until
   * the try ends. `try_defense` in the payload is what tells a later statistics
   * pass that these two points were not a converted two-point try.
   */
  const writeDefensiveTry = async (jersey: number | null): Promise<void> => {
    const defence = opponentName;
    if (pendingPat === null || patBusy || defence === null) {
      return;
    }
    setPatBusy(true);
    setPatError(null);
    try {
      rememberPatOrigin();
      const event: GameLogEventInput = {
        name: "2-Extra-Punkte",
        input: "Gegner",
        payload: { try_defense: true },
      };
      if (jersey !== null) {
        event.player = jersey;
      }
      await submit([event], defence, { flipOrigin: pendingPat.originId });
      setPatDefense(false);
      closePat();
    } catch (failure) {
      setPatError(
        errorMessage(
          failure,
          "Der Punkt für den Gegner konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      setPatBusy(false);
    }
  };

  /** Overtime's **+1 XP**: the same jersey step, without a touchdown behind it. */
  const openSinglePat = (): void => {
    if (possessionName === null) {
      return;
    }
    setPatTry({ team: possessionName, points: 1, defaultJersey: null });
    setPatMiss(null);
    setPatJersey(null);
    setPatQb(readQuarterback(game.id, possessionSide ?? patSideOf(possessionName)));
    setPatError(null);
  };

  useEffect(() => {
    if (pendingPat !== null && patTry === null) {
      patFirst.current?.focus();
    }
  }, [pendingPat, patTry]);

  /** "Spiel beenden" waits for an open extra point instead of dropping it. */
  const finish = (): void => {
    if (pendingPat !== null) {
      setFinishBlocked(true);
      return;
    }
    forgetBreak(game.id);
    onFinalize(log);
  };

  return {
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
    secondHalfTeam,
    startHalftime,
    startSecondHalf,
    openPat,
    touchdownGroupOf,
    submitTouchdown,
    closePat,
    rememberPatOrigin,
    reopenPat,
    writePat,
    writeMissedPat,
    answerPat,
    writeDefensiveTry,
    openSinglePat,
    finish,
  };
}
