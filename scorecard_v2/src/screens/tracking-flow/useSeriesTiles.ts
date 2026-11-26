import {
  type Dispatch,
  type SetStateAction,
} from "react";

import type { GameLogEventInput } from "../../api/types";
import {
  advance,
  driveSpotText,
  driveText,
  isTurnoverOnDowns,
} from "../../app/drive";
import { LogRow } from "../../components/EventLog";
import { errorMessage } from "../../components/sheets/errors";
import { seriesEvent, type SeriesMode } from "../../components/sheets/SeriesSheet";
import type { SpielzugPick } from "../../components/sheets/SpielzugSheet";
import { yardsText } from "../../components/sheets/yards";
import type { GameSession } from "../../session/gameSession";
import { ONE_TAP_EVENT, addsJerseyLater, type JerseyLater } from "./logic";
import type { SheetState } from "./logic";

interface UseSeriesTilesArgs {
  rows: LogRow[];
  session: GameSession;
  possessionName: string | null;
  opponentName: string | null;
  drive: ReturnType<typeof import("../../app/drive").driveAfter>;
  geometry: ReturnType<typeof import("../../app/drive").geometryOf>;
  sheet: SheetState | null;
  setSheet: Dispatch<SetStateAction<SheetState | null>>;
  sheetHistory: SheetState[];
  setSheetHistory: Dispatch<SetStateAction<SheetState[]>>;
  replacing: LogRow | null;
  setReplacing: Dispatch<SetStateAction<LogRow | null>>;
  setQuick: Dispatch<SetStateAction<SeriesMode | null>>;
  setConfirmation: Dispatch<SetStateAction<string | null>>;
  setQuickError: Dispatch<SetStateAction<string | null>>;
  armed: JerseyLater | "overtime" | null;
  arm: (mode: JerseyLater) => void;
  disarm: () => void;
  submit: (
    events: GameLogEventInput[],
    teamOverride?: string,
    options?: { keepBall?: boolean; flipOrigin?: string },
  ) => Promise<void>;
  undo: (
    row: LogRow,
    options?: { keepPossession?: boolean },
  ) => Promise<void>;
  openPat: (
    team: string,
    jersey: number | null,
    originId?: string,
    group?: number | null,
  ) => void;
  touchdownGroupOf: (team: string) => number | null;
  overtime: boolean;
  openSinglePat: () => void;
  startOvertime: () => Promise<void>;
}

/** One-tap series tiles, sheet navigation and play submission. */
export function useSeriesTiles({
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
}: UseSeriesTilesArgs) {
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

  return {
    closeSheet,
    openSheet,
    backSheet,
    pickFromSpielzug,
    quickRow,
    recordOneTap,
    undoQuick,
    completeQuick,
    tapSeriesTile,
    recentJerseys,
    submitPlay,
    takeTimeout,
    submitSeries,
  };
}
