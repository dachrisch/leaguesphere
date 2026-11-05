/**
 * Downs, distance and the spot — the series engine.
 *
 * The scorecard records the play (yards included), so down, distance and the
 * ball's position can be derived from the log instead of being typed.
 *
 * The field is the 50-yard flag-football field: the offence's own goal line is
 * 0, midfield is 25 and the opponent's goal line is 50. The spot is shown the
 * way the officials call it: `A12` is the own 12, `M` is midfield and `B14` is
 * the opponent's 14. A series starts at `A5` and its first line to gain is
 * midfield (`1st & M`); once the ball crosses midfield the line to gain is the
 * goal line (`1st & G`) and the B yards count down to `B0`.
 *
 * The spot only changes when a play moves it or the officials set it (a
 * kickoff, a turnover) — a **Feldposition** row carries it. A penalty also
 * moves it: its structured `yardage` is applied to the current spot, never
 * closer than half the distance to either goal line, and a penalty that pushes
 * the ball across midfield starts a fresh `1st & G`.
 */
import type { LogRow } from "../components/EventLog";

export interface DriveState {
  /** 1–4. */
  down: number;
  /** Yards to the line to gain (stored for arithmetic; the UI shows M or G). */
  toGo: number;
  /** 0 (own goal line) to 50 (opponent's), or `null` before it is set. */
  ballOn: number | null;
  /** True once the series' line to gain is the goal line ("& G"). */
  goal: boolean;
}

/** The 50-yard field. */
export const FIELD_LENGTH = 50;

/** The line that has to be crossed for the first down of a new series. */
export const MIDFIELD = 25;

/** Every series starts on the offence's own 5-yard line. */
export const SERIES_START = 5;

/** How a penalty changes the down count. */
export type PenaltyNextDown = "repeat" | "first_down" | "loss_of_down";

/** A penalty's structured spot change, or `null` when it carries none. */
export interface PenaltySpot {
  /** Signed from the offence's view: positive moves toward the goal. */
  yardage: number;
  nextDown: PenaltyNextDown;
}

/** Every series starts here; the spot is set by the officials. */
export const FIRST_AND_TEN: DriveState = {
  down: 1,
  toGo: MIDFIELD - SERIES_START,
  ballOn: SERIES_START,
  goal: false,
};

/** The rows a scrimmage play writes (see `PlaySheet`). */
const PLAY_EVENTS = new Set(["Pass", "Pass unvollständig", "Run", "Sack"]);

/** The row that sets the spot (see `FieldPositionSheet`). */
const FIELD_EVENT = "Feldposition";

/** The row whose structured yardage moves the spot (see `PenaltySheet`). */
const PENALTY_EVENT = "Strafe";

/** Rows that end the series and start the next one at A5. */
const KICKOFF_EVENTS = new Set([
  "Touchdown",
  "Spiel gestartet",
  "2. Halbzeit gestartet",
  "Overtime startet",
  "Spiel beendet",
]);

/** Rows that hand the ball over; the new series also starts at A5. */
const TURNOVER_EVENTS = new Set(["Turnover", "Interception"]);

function clampSpot(value: number): number {
  return Math.max(0, Math.min(FIELD_LENGTH, value));
}

/** Yards to the line to gain for a fresh series on this spot. */
export function firstDownDistance(ballOn: number | null): number {
  if (ballOn === null) {
    return MIDFIELD - SERIES_START;
  }
  return ballOn >= MIDFIELD ? FIELD_LENGTH - ballOn : MIDFIELD - ballOn;
}

/** A fresh series on the given spot. */
export function seriesAt(ballOn: number | null): DriveState {
  return {
    down: 1,
    toGo: firstDownDistance(ballOn),
    ballOn,
    goal: ballOn !== null && ballOn >= MIDFIELD,
  };
}

/** The state after one play at the current spot. */
export function advance(state: DriveState, yards: number): DriveState {
  if (state.ballOn === null) {
    return {
      ...state,
      down: state.down >= 4 ? 1 : state.down + 1,
      toGo: Math.max(0, state.toGo - yards),
    };
  }

  const ballOn = clampSpot(state.ballOn + yards);

  // A goal-to-go series keeps the goal line as its line to gain, even when a
  // loss carries the ball back across midfield.
  if (state.goal) {
    if (ballOn >= FIELD_LENGTH) {
      return seriesAt(ballOn);
    }
    if (state.down >= 4) {
      return seriesAt(SERIES_START);
    }
    return {
      down: state.down + 1,
      toGo: FIELD_LENGTH - ballOn,
      ballOn,
      goal: true,
    };
  }

  // Reaching midfield is the first down of the series.
  if (ballOn >= MIDFIELD) {
    return seriesAt(ballOn);
  }
  if (state.down >= 4) {
    return seriesAt(SERIES_START);
  }
  return {
    down: state.down + 1,
    toGo: MIDFIELD - ballOn,
    ballOn,
    goal: false,
  };
}

/** True when the play ends the series on downs. */
export function isTurnoverOnDowns(state: DriveState, yards: number): boolean {
  if (state.down !== 4) {
    return false;
  }
  if (state.ballOn === null) {
    return state.toGo - yards > 0;
  }
  const ballOn = clampSpot(state.ballOn + yards);
  return state.goal ? ballOn < FIELD_LENGTH : ballOn < MIDFIELD;
}

/**
 * The spot after a penalty.
 *
 * The signed `yardage` moves the ball from the last spot. A penalty may never
 * move the ball closer to either goal than half the remaining distance, so a
 * 5-yard penalty on the 9 leaves the ball on the 4.5 (not the 4). If the
 * result is at or past midfield the series restarts as `1st & G`, whatever
 * `nextDown` says; otherwise `nextDown` decides the down and the line to gain
 * returns to midfield.
 */
export function applyPenalty(
  state: DriveState,
  yardage: number,
  nextDown: PenaltyNextDown = "repeat",
): DriveState {
  const spot = state.ballOn ?? SERIES_START;
  let ballOn = spot + yardage;
  if (yardage < 0) {
    ballOn = Math.max(ballOn, spot / 2);
  } else if (yardage > 0) {
    ballOn = Math.min(ballOn, (FIELD_LENGTH + spot) / 2);
  }
  ballOn = clampSpot(ballOn);

  if (ballOn >= MIDFIELD) {
    return seriesAt(ballOn);
  }

  let down = state.down;
  if (nextDown === "first_down") {
    down = 1;
  } else if (nextDown === "loss_of_down") {
    down = state.down + 1;
  }
  if (down > 4) {
    return seriesAt(SERIES_START);
  }
  return {
    down,
    toGo: MIDFIELD - ballOn,
    ballOn,
    goal: false,
  };
}

/** The same spot seen from the other side. */
export function mirror(ballOn: number | null): number | null {
  return ballOn === null ? null : FIELD_LENGTH - ballOn;
}

/** The structured spot of a **Feldposition** row, or `null`. */
export function spotOf(row: LogRow): number | null {
  const ballOn = row.payload?.ballOn;
  if (typeof ballOn === "number" && Number.isFinite(ballOn)) {
    return clampSpot(ballOn);
  }
  return null;
}

/** The structured spot change of a **Strafe** row, or `null`. */
export function penaltyOf(row: LogRow): PenaltySpot | null {
  if (row.payload === null || row.payload === undefined) {
    return null;
  }
  const yardage = row.payload.yardage;
  if (typeof yardage !== "number" || !Number.isFinite(yardage)) {
    return null;
  }
  const raw = row.payload.nextDown;
  const nextDown: PenaltyNextDown =
    raw === "first_down" || raw === "loss_of_down" ? raw : "repeat";
  return { yardage, nextDown };
}

/**
 * The drive as the log tells it, newest row last.
 *
 * A play belongs to the team that ran it: when the team changes (a touchdown
 * flip, a turnover, a failed fourth down, a manual switch), the new series
 * starts at A5. Markers do the same, and a deleted row does not count at all —
 * an undo rewinds the series. A penalty moves the spot and the down chain
 * without changing possession; a later **Feldposition** row always wins.
 */
export function driveAfter(rows: LogRow[]): DriveState {
  let state: DriveState = { ...FIRST_AND_TEN };
  let lastTeam: string | null = null;

  for (const row of [...rows].reverse()) {
    if (row.isDeleted) {
      continue;
    }
    if (row.event === FIELD_EVENT) {
      const ballOn = spotOf(row);
      if (ballOn !== null) {
        state = seriesAt(ballOn);
      }
      lastTeam = row.team;
      continue;
    }
    if (row.event === PENALTY_EVENT) {
      const penalty = penaltyOf(row);
      if (penalty !== null) {
        state = applyPenalty(state, penalty.yardage, penalty.nextDown);
      }
      continue;
    }
    if (!PLAY_EVENTS.has(row.event)) {
      if (KICKOFF_EVENTS.has(row.event)) {
        state = { ...FIRST_AND_TEN };
        lastTeam = null;
      } else if (TURNOVER_EVENTS.has(row.event)) {
        state = { ...FIRST_AND_TEN };
        lastTeam = row.team;
      }
      continue;
    }
    if (lastTeam !== null && row.team !== lastTeam) {
      // A new possession without a marker: the new offence starts at A5.
      state = { ...FIRST_AND_TEN };
    }
    state = advance(state, yardsOf(row));
    lastTeam = row.team;
  }

  return state;
}

/** The structured yards of one row; a missing payload counts as no gain. */
export function yardsOf(row: LogRow): number {
  const yards = row.payload?.yards;
  return typeof yards === "number" && Number.isFinite(yards) ? yards : 0;
}

/** `1st & M`, `3rd & M`, `4th & G` — the officials' shorthand. */
export function driveText(state: DriveState): string {
  return `${ordinal(state.down)} & ${state.goal ? "G" : "M"}`;
}

/**
 * `A5`, `M`, `B14` — the spot as the officials call it, `null` when it has not
 * been set. Half yards are shown the German way (`A4,5`).
 */
export function spotText(ballOn: number | null): string | null {
  if (ballOn === null) {
    return null;
  }
  const spot = clampSpot(ballOn);
  if (spot === MIDFIELD) {
    return "M";
  }
  if (spot < MIDFIELD) {
    return `A${formatYards(spot)}`;
  }
  return `B${formatYards(FIELD_LENGTH - spot)}`;
}

/** One decimal at most, in the German comma notation (`4.5` → `4,5`). */
export function formatYards(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace(".", ",");
}

function ordinal(down: number): string {
  if (down === 1) {
    return "1st";
  }
  if (down === 2) {
    return "2nd";
  }
  if (down === 3) {
    return "3rd";
  }
  return `${down}th`;
}
