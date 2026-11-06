import { describe, expect, it } from "vitest";

import { RULES } from "../api/rules.test";
import { DEFAULT_SCORING_VALUES, scoringValuesOf } from "./scoring";

describe("the scoring table", () => {
  it("falls back to the shipped values before the definition arrives", () => {
    expect(scoringValuesOf(null)).toEqual(DEFAULT_SCORING_VALUES);
    expect(scoringValuesOf(undefined)).toEqual(DEFAULT_SCORING_VALUES);
    expect(DEFAULT_SCORING_VALUES).toEqual({
      Touchdown: 6,
      Overtime: 1,
      "1-Extra-Punkt": 1,
      "Safety (+1)": 1,
      "2-Extra-Punkte": 2,
      "Safety (+2)": 2,
    });
  });

  it("reads every value from the definition", () => {
    const rules = {
      ...RULES,
      scoring: {
        ...RULES.scoring,
        touchdown: 7,
        try: { "5": 1, "10": 3 },
        try_safety: 1,
        safety: 2,
      },
      overtime: { ...RULES.overtime, tiebreak_try: { spot: 5, points: 2 } },
    };

    expect(scoringValuesOf(rules)).toEqual({
      Touchdown: 7,
      "1-Extra-Punkt": 1,
      "2-Extra-Punkte": 3,
      Overtime: 2,
      "Safety (+1)": 1,
      "Safety (+2)": 2,
    });
  });
});

describe("a scoring table that is not a table", () => {
  it("falls back instead of previewing garbage", () => {
    expect(scoringValuesOf({} as never)).toEqual(DEFAULT_SCORING_VALUES);
  });
});
