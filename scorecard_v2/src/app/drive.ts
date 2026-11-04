/**
 * Downs, distance and the spot — the series engine.
 *
 * The scorecard records the play (yards included), so down, distance and the
 * ball's position can be derived from the log instead of being typed: a play
 * that reaches the line to gain starts a new first down, a fourth down that
 * does not is a turnover on downs, and a new possession starts a fresh series.
 *
 * The spot is the offence's own goal line as 0 and the opponent's as 100, so a
 * play simply adds its yards. It only changes when the officials set it (a
 * kickoff, a turnover) — a **Feldposition** row carries it.
 */
import type { LogRow } from "../components/EventLog";

export interface DriveState {
  /** 1–4. */
  down: number;
  /** Yards to the line to gain (or to the goal in a goal-to-go series). */
  toGo: number;
  /** 0 (own goal line) to 100 (opponent's), or `null` until it is set. */
  ballOn: number | null;
  /** True when the line to gain is the goal line ("& Goal" for the series). */
  goal: boolean;
}

/** Every series starts here; the spot is set by the officials. */
export const FIRST_AND_TEN: DriveState = {
  down: 1,
  toGo: 10,
  ballOn: null,
  goal: false,
};

/** The rows a scrimmage play writes (see `PlaySheet`). */
const PLAY_EVENTS = new Set(["Pass", "Pass unvollständig", "Run", "Sack"]);

/** The row that sets the spot (see `FieldPositionSheet`). */
const FIELD_EVENT = "Feldposition";

/** Rows that end the series and start the next one at an unknown spot. */
const KICKOFF_EVENTS = new Set([
  "Touchdown",
  "Spiel gestartet",
  "2. Halbzeit gestartet",
  "Overtime startet",
  "Spiel beendet",
]);

/** Rows that hand the ball over at the current spot (mirrored). */
const TURNOVER_EVENTS = new Set(["Turnover", "Interception"]);

/** The goal line a series on this spot attacks. */
function goalToGoal(ballOn: number | null): boolean {
  return ballOn !== null && 100 - ballOn <= 10;
}

/** Yards to gain for a first down: ten, or the goal line when it is closer. */
export function firstDownDistance(ballOn: number | null): number {
  if (ballOn === null) {
    return 10;
  }
  return Math.max(1, Math.min(10, 100 - ballOn));
}

/** A fresh series on the given spot. */
export function seriesAt(ballOn: number | null): DriveState {
  return {
    down: 1,
    toGo: firstDownDistance(ballOn),
    ballOn,
    goal: goalToGoal(ballOn),
  };
}

/** The state after one play at the current spot. */
export function advance(state: DriveState, yards: number): DriveState {
  const ballOn =
    state.ballOn === null
      ? null
      : Math.max(0, Math.min(100, state.ballOn + yards));
  const remaining = state.toGo - yards;
  if (remaining <= 0) {
    return seriesAt(ballOn);
  }
  if (state.down >= 4) {
    return seriesAt(mirror(ballOn));
  }
  return { ...state, down: state.down + 1, toGo: remaining, ballOn };
}

/** True when the play ends the series on downs. */
export function isTurnoverOnDowns(state: DriveState, yards: number): boolean {
  return state.down === 4 && state.toGo - yards > 0;
}

/** The same spot seen from the other side. */
export function mirror(ballOn: number | null): number | null {
  return ballOn === null ? null : 100 - ballOn;
}

/** The structured spot of a **Feldposition** row, or `null`. */
export function spotOf(row: LogRow): number | null {
  const ballOn = row.payload?.ballOn;
  if (typeof ballOn === "number" && Number.isFinite(ballOn)) {
    return Math.max(0, Math.min(100, ballOn));
  }
  return null;
}

/**
 * The drive as the log tells it, newest row last.
 *
 * A play belongs to the team that ran it: when the team changes (a touchdown
 * flip, a turnover, a failed fourth down, a manual switch), the series starts
 * over — at the mirrored spot unless the change is a kickoff (a score, a
 * half-time, overtime), where the spot is unknown until it is set. Markers do
 * the same, and a deleted row does not count at all — an undo rewinds the
 * series.
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
    if (!PLAY_EVENTS.has(row.event)) {
      if (KICKOFF_EVENTS.has(row.event)) {
        state = { ...FIRST_AND_TEN };
        lastTeam = null;
      } else if (TURNOVER_EVENTS.has(row.event)) {
        state = seriesAt(mirror(state.ballOn));
        lastTeam = row.team;
      }
      continue;
    }
    if (lastTeam !== null && row.team !== lastTeam) {
      // A new possession without a marker: the ball changed hands on the spot.
      state = seriesAt(mirror(state.ballOn));
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

/** `1st & 10`, `3rd & 4`, `4th & Goal` — the officials' shorthand. */
export function driveText(state: DriveState): string {
  return `${ordinal(state.down)} & ${state.goal ? "Goal" : state.toGo}`;
}

/**
 * `eigene 43`, `gegn. 40` — the spot as the officials call it, `null` when it
 * has not been set.
 */
export function spotText(ballOn: number | null): string | null {
  if (ballOn === null) {
    return null;
  }
  if (ballOn === 50) {
    return "Mittelfeld";
  }
  return ballOn < 50 ? `eigene ${ballOn}` : `gegn. ${100 - ballOn}`;
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
