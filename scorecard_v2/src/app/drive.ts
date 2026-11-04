/**
 * Downs and distance — the series engine.
 *
 * The scorecard records the play (yards included), so the down & distance can
 * be derived from the log instead of being typed: a play that reaches the
 * line to gain starts a new first down, a fourth down that does not is a
 * turnover on downs, and a new possession (touchdown, turnover, interception,
 * half-time, overtime, a manual switch) starts a fresh series.
 *
 * Deliberately **no absolute field position**: without a kickoff/punt model a
 * yard line would be made up. Down and distance are what the officials and the
 * ticker need — "3rd & 4".
 */
import type { LogRow } from "../components/EventLog";

export interface DriveState {
  /** 1–4. */
  down: number;
  /** Yards still to gain for a first down. */
  toGo: number;
}

/** Every series starts here: no kickoff model yet. */
export const FIRST_AND_TEN: DriveState = { down: 1, toGo: 10 };

/** The rows a scrimmage play writes (see `PlaySheet`). */
const PLAY_EVENTS = new Set(["Pass", "Pass unvollständig", "Run", "Sack"]);

/** Rows that end the series, whatever the yards say. */
const RESET_EVENTS = new Set([
  "Touchdown",
  "Turnover",
  "Interception",
  "Spiel gestartet",
  "2. Halbzeit gestartet",
  "Overtime startet",
  "Spiel beendet",
]);

/** The structured yards of one row; a missing payload counts as no gain. */
export function yardsOf(row: LogRow): number {
  const yards = row.payload?.yards;
  return typeof yards === "number" && Number.isFinite(yards) ? yards : 0;
}

/**
 * The state after one play: first down when the line to gain is reached,
 * otherwise the next down with the remaining distance. A fourth down short of
 * the line ends the series (the possession then belongs to the other team).
 */
export function advance(state: DriveState, yards: number): DriveState {
  const remaining = state.toGo - yards;
  if (remaining <= 0) {
    return { ...FIRST_AND_TEN };
  }
  if (state.down >= 4) {
    return { ...FIRST_AND_TEN };
  }
  return { down: state.down + 1, toGo: remaining };
}

/** True when the play ends the series on downs. */
export function isTurnoverOnDowns(state: DriveState, yards: number): boolean {
  return state.down === 4 && state.toGo - yards > 0;
}

/**
 * The drive as the log tells it, newest row last.
 *
 * A play belongs to the team that ran it: when the team changes (a touchdown
 * flip, a turnover, a failed fourth down, a manual switch), the series starts
 * over. Markers do the same, and a deleted row does not count at all — an undo
 * rewinds the series.
 */
export function driveAfter(rows: LogRow[]): DriveState {
  let state: DriveState = { ...FIRST_AND_TEN };
  let lastTeam: string | null = null;

  for (const row of [...rows].reverse()) {
    if (row.isDeleted) {
      continue;
    }
    if (!PLAY_EVENTS.has(row.event)) {
      if (RESET_EVENTS.has(row.event)) {
        state = { ...FIRST_AND_TEN };
        lastTeam = null;
      }
      continue;
    }
    if (lastTeam !== null && row.team !== lastTeam) {
      state = { ...FIRST_AND_TEN };
    }
    state = advance(state, yardsOf(row));
    lastTeam = row.team;
  }

  return state;
}

/** `1st & 10`, `3rd & 4` — the shorthand officials and the ticker use. */
export function driveText(state: DriveState): string {
  const ordinal =
    state.down === 1
      ? "1st"
      : state.down === 2
        ? "2nd"
        : state.down === 3
          ? "3rd"
          : `${state.down}th`;
  return `${ordinal} & ${state.toGo}`;
}
