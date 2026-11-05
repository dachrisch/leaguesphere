/**
 * What a row is worth, derived from the sport definition.
 *
 * The keys are the row names `TeamLog` stores; the values come from
 * `scoring` in `gameevents/sport/flag_football_5v5.json` (IFAF 2023 R 8-1-1).
 * The backend is authoritative for the real score — this table only previews
 * the next payload while an entry is queued.
 *
 * `DEFAULT_SCORING_VALUES` keeps the numbers the app shipped with, so a device
 * that has not fetched the definition yet still previews correctly.
 */
import type { GameRules } from "../api/rules";

/** Row name → points. */
export type ScoringValues = Record<string, number>;

/** IFAF 2023 R 8-1-1; the fallback before the definition arrives. */
export const DEFAULT_SCORING_VALUES: ScoringValues = {
  Touchdown: 6,
  Overtime: 1,
  "1-Extra-Punkt": 1,
  "Safety (+1)": 1,
  "2-Extra-Punkte": 2,
  "Safety (+2)": 2,
};

/** The definition's scoring table, or the shipped defaults. */
export function scoringValuesOf(rules: GameRules | null | undefined): ScoringValues {
  if (rules === null || rules === undefined) {
    return DEFAULT_SCORING_VALUES;
  }
  const scoring = rules.scoring;
  const overtime = rules.overtime;
  if (scoring === null || scoring === undefined || overtime?.tiebreak_try === undefined) {
    return DEFAULT_SCORING_VALUES;
  }
  const value = (candidate: unknown, fallback: number): number =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
  return {
    Touchdown: value(scoring.touchdown, 6),
    "1-Extra-Punkt": value(scoring.try?.["5"], 1),
    "2-Extra-Punkte": value(scoring.try?.["10"], 2),
    Overtime: value(overtime.tiebreak_try.points, 1),
    "Safety (+1)": value(scoring.try_safety, 1),
    "Safety (+2)": value(scoring.safety, 2),
  };
}
