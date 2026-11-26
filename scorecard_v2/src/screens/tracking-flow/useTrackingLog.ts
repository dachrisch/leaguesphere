import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { apiGet } from "../../api/client";
import { RULES_PATH, type GameRules } from "../../api/rules";
import type {
  Game,
  GameLogEventInput,
  GameSetup,
  Official,
  Penalty,
  RosterPlayer,
  TeamOfficial,
} from "../../api/types";
import { geometryOf } from "../../app/drive";
import { readQuarterback, rememberQuarterback } from "../../app/quarterback";
import { useWakeLock } from "../../app/sideline";
import { eventOfRow } from "../../session/events";
import { logRows, undoBody, type LogRow } from "../../components/EventLog";
import { isPossessing } from "../../components/ScoreHeader";
import { pauseReason } from "../../components/SyncBadge";
import {
  unsportsmanlikeRecord,
  type UnsportsmanlikeRecord,
} from "../../components/sheets/PenaltySheet";
import { errorMessage, IgnoredWrite } from "../../components/sheets/errors";
import { getDeviceId } from "../../device";
import { cachedGet, cachedGetMeta, snapshotKey } from "../../offline/snapshot";
import {
  undoPossessionTeamOfGroup,
  undoneTry,
  undoneTouchdown,
} from "../../session/possessionUndo";
import { getRuntime } from "../../session/runtime";
import { isStranded } from "../../session/stranded";
import { useSyncStatus } from "../../session/useSyncStatus";
import { lockFrom, type LockAnswer } from "../../session/lock";
import type { GameSession } from "../../session/gameSession";
import type { Side } from "./logic";

interface UseTrackingLogArgs {
  game: Game;
  session: GameSession;
  rules: GameRules | null;
  setRules: Dispatch<SetStateAction<GameRules | null>>;
  setRoster: Dispatch<SetStateAction<RosterPlayer[] | null>>;
  setSetup: Dispatch<SetStateAction<GameSetup | null>>;
  setupLoadRef: MutableRefObject<Promise<GameSetup | null | undefined> | null>;
  setOfficials: Dispatch<SetStateAction<Official[] | null>>;
  setOfficialsUnavailable: Dispatch<SetStateAction<boolean>>;
  setPeople: Dispatch<SetStateAction<TeamOfficial[]>>;
  possession: string | null;
  setPossession: Dispatch<SetStateAction<string | null>>;
  setPossessionPending: Dispatch<SetStateAction<boolean>>;
  setPossessionError: Dispatch<SetStateAction<string | null>>;
  setUndoKey: Dispatch<SetStateAction<string | null>>;
  setUndoError: Dispatch<SetStateAction<string | null>>;
  editing: LogRow | null;
  setEditing: Dispatch<SetStateAction<LogRow | null>>;
  setPosting: Dispatch<SetStateAction<boolean>>;
  halftimePending: boolean;
  pendingPat: { team: string; group?: number | null } | null;
  closePat: () => void;
  reopenPat: (row: LogRow, keepPossession: boolean) => void;
  possessionInFlightRef: MutableRefObject<boolean>;
  undoInFlightRef: MutableRefObject<boolean>;
  postInFlightRef: MutableRefObject<boolean>;
  disarm: () => void;
}

/** Log subscription, derived log state, possession/undo/edit handlers. */
export function useTrackingLog({
  game,
  session,
  rules,
  setRules,
  setRoster,
  setSetup,
  setupLoadRef,
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
  closePat,
  reopenPat,
  possessionInFlightRef,
  undoInFlightRef,
  postInFlightRef,
  disarm,
}: UseTrackingLogArgs) {
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
          !possessionInFlightRef.current &&
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
  /** Down & distance as the log tells it — recomputed on every row change. */
  const geometry = useMemo(() => geometryOf(rules), [rules]);
  /**
   * Every Auszeit still on the board, newest first as the log lists it. The
   * sheet shows both sides so the officials can answer "who took which
   * timeout, and when".
   */
  const timeouts = useMemo(
    () =>
      rows
        .filter((row) => row.event === "Auszeit" && !row.isDeleted)
        .map((row) => ({
          team: row.team ?? "–",
          half: row.half,
          time: row.input ?? "–",
        })),
    [rows],
  );
  /**
   * Every UNV still on the board. The penalty sheet shows the charged team's
   * entries and warns when the current call is the second UNV for a number.
   */
  const unsportsmanlike = useMemo(
    () =>
      rows
        .map(unsportsmanlikeRecord)
        .filter(
          (entry): entry is UnsportsmanlikeRecord => entry !== null,
        ),
    [rows],
  );
  const finished = game.status.trim().toLowerCase() === "beendet";
  const status = useSyncStatus(game.id);
  // A phone that lost the lock still holds its entries. Its main score is the
  // server's; the device's own number is labelled separately in the strip.
  const stranded = isStranded(status);
  const officialLog = stranded ? session.getServerLog() : log;
  // The server said this device may not write (another device holds the game,
  // or the session expired). Read-only with the reason, not a silent failure.
  const readOnly = status.paused === "device" || status.paused === "auth";
  const stopReason = pauseReason(status.paused);
  /** Staff may lift another device's lock ("Spiel übernehmen"). */
  const [canRelease, setCanRelease] = useState(false);
  /**
   * Whether the open read already answered the lock question. A pause that
   * only the first *write* discovered (or an open that fell back to the cached
   * setup) leaves it unset, and the strip would hide the staff take-over.
   */
  const lockRightsKnown = useRef(false);


  /* v8 ignore start -- mount effects, lock-rights reads and the drain timer are exercised by Tracking.test.tsx (5,580 lines), the live stage journeys and the offline e2e scenarios; they are not re-characterized by this extraction scope */
  /**
   * "Alles gesendet" for a moment after the queue drained: the pending count
   * is compared while rendering (React's "adjust state on a changed input"
   * pattern), and only the timeout that hides it again runs in an effect.
   */
  const [prevPending, setPrevPending] = useState(status.pending);
  const [drainTick, setDrainTick] = useState(0);
  const [drained, setDrained] = useState(false);
  if (status.pending !== prevPending) {
    setPrevPending(status.pending);
    if (status.pending === 0 && prevPending > 0 && status.paused === null) {
      setDrained(true);
      setDrainTick((tick) => tick + 1);
    } else if (status.pending > 0) {
      setDrained(false);
    }
  }
  useEffect(() => {
    if (drainTick === 0) {
      return;
    }
    const timer = setTimeout(() => setDrained(false), 2500);
    return () => clearTimeout(timer);
  }, [drainTick]);
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
    // The definition decides the field, the series and the penalty numbers;
    // preloaded so a device that loses the network mid-game keeps them.
    void cachedGet<GameRules>(snapshotKey.rules(), RULES_PATH)
      .then(setRules)
      .catch(() => undefined);
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
    // stays `null` and the half-time falls back to switching the ball.
    // The same read names this device, so a fresh answer also says whether
    // another device holds the game: read-only on open, not on the first
    // write. A stored (offline) answer never decides the lock.
    const loaded = cachedGetMeta<GameSetup & LockAnswer>(
      snapshotKey.setup(game.id),
      `/api/game/${game.id}/setup`,
      { deviceId: getDeviceId() },
    ).catch(() => null);
    setupLoadRef.current = loaded.then((answer) => answer?.value ?? null);
    void loaded.then((answer) => {
      if (active) {
        setSetup(answer?.value ?? null);
      }
      // The pre-game quarterback is a typing aid, not game state: seed it
      // into this device's memory so the first pass is one tap shorter. Every
      // device that opens the game gets the same seed from the setup; a QB
      // this device already changed stays as it is.
      const seededHome = answer?.value?.qbHome;
      const seededAway = answer?.value?.qbAway;
      if (
        typeof seededHome === "number" &&
        Number.isFinite(seededHome) &&
        readQuarterback(game.id, "home") === null
      ) {
        rememberQuarterback(game.id, "home", seededHome);
      }
      if (
        typeof seededAway === "number" &&
        Number.isFinite(seededAway) &&
        readQuarterback(game.id, "away") === null
      ) {
        rememberQuarterback(game.id, "away", seededAway);
      }
      const lock = answer?.updatedAt === null ? lockFrom(answer.value) : null;
      if (lock === null || !active) {
        return;
      }
      lockRightsKnown.current = true;
      setCanRelease(lock.canRelease);
      if (lock.lockedElsewhere) {
        getRuntime().sync.pause("device", game.id);
      }
    });
    return () => {
      active = false;
    };
  }, [game.id]);

  useEffect(() => {
    // The queue paused on a `409` the open read never saw (a write found the
    // lock, or the setup came from the cached copy). Ask the server once who
    // may release it, so staff still get "Spiel übernehmen" instead of the
    // dead-end hint "Die Turnierleitung kann die Gerätesperre aufheben".
    if (status.paused !== "device" || lockRightsKnown.current) {
      return;
    }
    lockRightsKnown.current = true;
    let active = true;
    void apiGet<GameSetup & LockAnswer>(`/api/game/${game.id}/setup`, {
      deviceId: getDeviceId(),
    })
      .then((answer) => {
        if (active) {
          setCanRelease(lockFrom(answer)?.canRelease === true);
        }
      })
      // Offline the strip keeps the hint: the attempt is retried on the next
      // pause, which is a new effect run.
      .catch(() => {
        lockRightsKnown.current = false;
      });
    return () => {
      active = false;
    };
  }, [game.id, status.paused]);

  useEffect(() => {
    let active = true;
    // The desktop context panel reads the same crew endpoints as preparation.
    // A failed read only leaves its optional list empty; tracking stays usable.
    void Promise.all([
      cachedGet<Official[]>(
        `officials:${game.id}`,
        `/api/game/${game.id}/officials`,
      ).catch(() => null),
      cachedGet<TeamOfficial[]>(
        `official-directory:${game.officialsId}`,
        `/api/officials/team/${game.officialsId}/list`,
      ).catch(() => []),
    ]).then(([crew, directory]) => {
      if (active) {
        setOfficials(crew);
        setOfficialsUnavailable(crew === null);
        setPeople(directory);
      }
    });
    return () => {
      active = false;
    };
  }, [game.id, game.officialsId]);

  /* v8 ignore stop */
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

  const takePossession = async (
    teamName: string,
    originId?: string,
  ): Promise<void> => {
    if (possessionInFlightRef.current || teamName === possession || readOnly) {
      return;
    }
    const previous = possession;
    possessionInFlightRef.current = true;
    disarm();
    setPossession(teamName);
    setPossessionPending(true);
    setPossessionError(null);
    try {
      // Online this is a `PUT`; offline (or after a lost answer) the session
      // queues it and resolves, so the marker stays where the tap put it.
      await session.setPossession(teamName, originId);
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
      possessionInFlightRef.current = false;
      setPossessionPending(false);
    }
  };

  const undo = async (
    row: LogRow,
    { keepPossession = false }: { keepPossession?: boolean } = {},
  ): Promise<void> => {
    if (undoInFlightRef.current || halftimePending || readOnly) {
      return;
    }
    undoInFlightRef.current = true;
    disarm();
    setUndoKey(row.key);
    setUndoError(null);
    // What this undo removes, read before the log changes: the touchdown whose
    // prompt it closes, the try whose prompt it reopens.
    const entryTouchdown = undoneTouchdown(row, rows);
    const entryTry = undoneTry(row, rows);
    try {
      // A row with a synthetic (negative) id never reached the server: the
      // session drops that queued op locally and never sends `DELETE`.
      const local =
        row.teamLogId !== null && row.teamLogId < 0
          ? row.teamLogId
          : undefined;
      // Only a stored, event-sourced row needs the ball put back by the
      // server; a queued row takes its linked flip with it, and an in-place
      // correction already decided where the ball belongs.
      const restore =
        local === undefined && !keepPossession && row.eventSeq !== null
          ? undoPossessionTeamOfGroup(row, rows, log)
          : null;
      await session.undo(
        undoBody(row),
        local,
        restore === null ? undefined : { restorePossessionTo: restore },
      );
      if (local !== undefined) {
        // Removing the entry (and its flip) replayed the server's marker: show
        // that, not the side the now-undone tap had set.
        setPossession(session.getLog().inPossession ?? null);
      } else if (restore !== null) {
        setPossession(restore);
      }
      // The extra point follows the entry it belongs to: a touchdown that is
      // undone takes its unanswered prompt with it, a try that is undone asks
      // again (the ball just went back to the scoring team).
      if (pendingPat !== null) {
        const undone = entryTouchdown;
        const closes =
          undone !== null &&
          (pendingPat.group !== null && pendingPat.group !== undefined
            ? row.groupSequence === pendingPat.group
            : undone.team === pendingPat.team);
        if (closes) {
          closePat();
        }
      } else if (entryTry !== null) {
        reopenPat(entryTry, keepPossession);
      }
    } catch (failure) {
      setUndoError(
        errorMessage(
          failure,
          "Der Eintrag konnte nicht rückgängig gemacht werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      undoInFlightRef.current = false;
      setUndoKey(null);
    }
  };

  /** Open the correction for one log row; nothing to change on a marker. */
  const openEdit = (row: LogRow): void => {
    if (readOnly || finished || row.team === null) {
      return;
    }
    disarm();
    setEditing(row);
  };

  /**
   * Correct a log row: write the same event with the fixed detail, then undo
   * the row that carried the mistake. The write keeps the row's team *and*
   * half, so correcting a first-half entry during the second half does not
   * move the points — and it never flips possession, unlike a fresh play.
   *
   * The correction names the row's event `seq`, which removes the whole
   * submission group: for a v2 game that group is the single play. A row the
   * old app wrote has no event and is not offered for editing at all.
   */
  const submitEdit = async (event: GameLogEventInput): Promise<void> => {
    const row = editing;
    if (row === null || row.team === null) {
      return;
    }
    if (postInFlightRef.current) {
      throw new IgnoredWrite("Der Eintrag wird gerade gespeichert.");
    }
    if (finished) {
      throw new IgnoredWrite("Dieses Spiel ist beendet.");
    }
    if (readOnly) {
      throw new IgnoredWrite(
        stopReason ?? "Dieses Gerät darf keine Einträge schreiben.",
      );
    }
    postInFlightRef.current = true;
    setPosting(true);
    disarm();
    try {
      // A submission can write more than one row: a scoring play carries its
      // touchdown. The correction names the group, so it removes all of it -
      // resending only the edited row would delete the touchdown. The group is
      // the **submission** (`groupSequence`), not one event: the play and its
      // touchdown rows have different event ids.
      // `rows` is newest first; reversing restores the order they were sent in.
      const group =
        row.eventSeq === null || row.groupSequence === 0
          ? [row]
          : rows
              .filter(
                (entry) =>
                  !entry.isDeleted &&
                  entry.groupSequence === row.groupSequence,
              )
              .reverse();
      // Compare by key: `rows` is a fresh array on every log change, so the
      // row objects are not identical to the one the sheet was opened with.
      const events = group.map((entry) =>
        entry.key === row.key ? event : eventOfRow(entry),
      );
      await session.writeEvent({
        gameId: game.id,
        team: row.team,
        half: row.half === 2 ? 2 : 1,
        event: events,
      });
      // The replacement already carries the ball's current side.
      await undo(row, { keepPossession: true });
    } finally {
      postInFlightRef.current = false;
      setPosting(false);
      setEditing(null);
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
  return {
    log,
    rows,
    geometry,
    timeouts,
    unsportsmanlike,
    finished,
    status,
    stranded,
    officialLog,
    readOnly,
    stopReason,
    drained,
    canRelease,
    resyncPossession,
    takePossession,
    undo,
    openEdit,
    submitEdit,
    logTeamName,
    possessionSide,
    opponentSide,
    possessionName,
    opponentName,
  };
}
