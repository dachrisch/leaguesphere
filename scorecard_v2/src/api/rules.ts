/**
 * The sport definition: the values the app calculates with.
 *
 * The server serves `gameevents/sport/flag_football_5v5.json` at
 * `GET /api/config/scorecard/rules` (IFAF 2023). The app never hardcodes a
 * rule value that the definition carries; it reads it here and falls back to
 * the defaults in `app/drive.ts` and `app/scoring.ts` when the definition has
 * not arrived yet (first paint, offline without a snapshot).
 *
 * The response is cached like every other read (see `offline/snapshot.ts`), so
 * a phone that boots without a network still has the definition it last saw.
 */
import type { PenaltyNextDown } from "../app/drive";
import { apiGet } from "./client";

export const RULES_PATH = "/api/config/scorecard/rules";

/** Where a penalty's distance is enforced (IFAF R 10-3). */
export type EnforcementSpot = "BS" | "SF" | "DB" | "SL";

/** One penalty as the definition carries it. */
export interface RulePenalty {
  code: string;
  /** The German label the scorecard shows; the event's `input` as well. */
  name: string;
  /** The legacy one-line description (`BS/1st 10`). */
  subtext: string;
  /** Distance in yards; `0` is a real no-distance foul. */
  yards: number;
  /** What it does to the down count. */
  down: "repeat" | "first" | "loss";
  enforcement: EnforcementSpot | null;
  side: "offense" | "defense";
  /** Rule reference (`7-1-3f`), for the sheet's help text. */
  rule: string;
  charged_timeout?: boolean;
  disqualification?: boolean;
}

export interface GameRules {
  sport: string;
  variant: string;
  ruleset: string;
  field: {
    length: number;
    width: number;
    end_zone: number;
    middle: number;
    no_run_zone: number;
    spot_precision: number;
  };
  series: {
    downs: number;
    start: number;
    line_to_gain: string[];
    first_down_at_middle: "once" | "always" | "never";
    turnover_on_downs_spot: number;
    interception_spot: "dead_ball" | "own5";
  };
  scoring: {
    touchdown: number;
    try: Record<string, number>;
    try_defense: number;
    try_safety: number;
    safety: number;
    touchback_spot: number;
    after_try_spot: number;
    safety_spot: number;
  };
  periods: {
    count: number;
    length_minutes: number;
    intermission_minutes: number;
    play_clock_seconds: number;
    pass_clock_seconds: number;
    running_clock_diff: number;
  };
  timeouts: {
    per_half: number;
    seconds: number;
    carry_over: boolean;
    in_overtime: boolean;
  };
  overtime: {
    start_spot: number;
    first_down_at_middle: boolean;
    tiebreak_try: { spot: number; points: number };
  };
  officials: { counts: number[] };
  penalties: RulePenalty[];
}

/** The definition's down rule as the drive engine names it. */
export function nextDownOf(penalty: {
  down?: RulePenalty["down"];
}): PenaltyNextDown | null {
  switch (penalty.down) {
    case "first":
      return "first_down";
    case "loss":
      return "loss_of_down";
    case "repeat":
      return "repeat";
    default:
      return null;
  }
}

/** The definition, or `null` when the server has not answered yet. */
export function fetchRules(): Promise<GameRules> {
  return apiGet<GameRules>(RULES_PATH);
}
