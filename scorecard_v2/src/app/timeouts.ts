/**
 * The charged-timeout budget of one half.
 *
 * IFAF R 3-3-2: each team has two charged timeouts per half, and unused ones
 * do not carry over. The rule is a **warning**, never a gate: the operator
 * records what the referee announced (meeting 2026-11-05, 36:57), so a third
 * timeout is written like any other - the sheet only says that the foul
 * "charged timeout without a timeout left" (5 yards) applies.
 */
import type { LogRow } from "../components/EventLog";

/** The timeouts a team has taken in one half, and what is left. */
export interface TimeoutBudget {
  /** The definition's `timeouts.per_half`. */
  perHalf: number;
  /** Timeouts this team took in this half. */
  used: number;
  /** `perHalf - used`, never negative. */
  remaining: number;
  /** True once the team has used its allowance (the next one is a foul). */
  exhausted: boolean;
}

/** Deleted rows do not count: an undo gives the timeout back. */
export function timeoutBudget(
  rows: LogRow[],
  team: string,
  half: number,
  perHalf: number,
): TimeoutBudget {
  const used = rows.filter(
    (row) => !row.isDeleted && row.event === "Auszeit" && row.team === team && row.half === half,
  ).length;
  return {
    perHalf,
    used,
    remaining: Math.max(0, perHalf - used),
    exhausted: used >= perHalf,
  };
}

/** `1/2`, `2/2` - the tile badge. */
export function timeoutText(budget: TimeoutBudget): string {
  return `${budget.used}/${budget.perHalf}`;
}
