import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "./client";
import { fetchRules, nextDownOf, RULES_PATH, type GameRules } from "./rules";

vi.mock("./client", () => ({ apiGet: vi.fn() }));

const getMock = apiGet as unknown as ReturnType<typeof vi.fn>;

export const RULES: GameRules = {
  sport: "flag_football",
  variant: "5v5",
  ruleset: "IFAF 2023",
  field: {
    length: 50,
    width: 25,
    end_zone: 10,
    middle: 25,
    no_run_zone: 5,
    spot_precision: 0.5,
  },
  series: {
    downs: 4,
    start: 5,
    line_to_gain: ["middle", "goal"],
    first_down_at_middle: "once",
    turnover_on_downs_spot: 5,
    interception_spot: "dead_ball",
  },
  scoring: {
    touchdown: 6,
    try: { "5": 1, "10": 2 },
    try_defense: 2,
    try_safety: 1,
    safety: 2,
    touchback_spot: 5,
    after_try_spot: 5,
    safety_spot: 5,
  },
  periods: {
    count: 2,
    length_minutes: 20,
    intermission_minutes: 2,
    play_clock_seconds: 25,
    pass_clock_seconds: 7,
    running_clock_diff: 30,
  },
  timeouts: { per_half: 2, seconds: 60, carry_over: false, in_overtime: false },
  overtime: {
    start_spot: 25,
    first_down_at_middle: false,
    tiebreak_try: { spot: 5, points: 1 },
  },
  officials: { counts: [2, 3, 4] },
  penalties: [
    {
      code: "illegal_handoff",
      name: "illegale Ballübergabe",
      subtext: "SF/LoD 5",
      yards: 5,
      down: "loss",
      enforcement: "SF",
      side: "offense",
      rule: "7-1-5",
    },
  ],
};

beforeEach(() => {
  getMock.mockReset();
});

describe("the rules endpoint", () => {
  it("reads the definition from the documented path", async () => {
    getMock.mockResolvedValue(RULES);

    await expect(fetchRules()).resolves.toEqual(RULES);
    expect(getMock).toHaveBeenCalledWith(RULES_PATH);
    expect(RULES_PATH).toBe("/api/config/scorecard/rules");
  });
});

describe("nextDownOf", () => {
  it("maps the definition's down rule onto the engine's", () => {
    expect(nextDownOf({ down: "repeat" })).toBe("repeat");
    expect(nextDownOf({ down: "first" })).toBe("first_down");
    expect(nextDownOf({ down: "loss" })).toBe("loss_of_down");
  });

  it("returns null when the catalogue carries no structured rule", () => {
    expect(nextDownOf({})).toBeNull();
  });
});
