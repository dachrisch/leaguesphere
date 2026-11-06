import { describe, expect, it } from "vitest";

import type { LogRow } from "../components/EventLog";
import { timeoutBudget, timeoutText } from "./timeouts";

function row(overrides: Partial<LogRow> = {}): LogRow {
  return {
    key: "t",
    teamLogId: 1,
    eventSeq: 1,
    groupSequence: 1,
    team: "Ravens",
    event: "Auszeit",
    player: null,
    input: "12:00",
    half: 1,
    cop: false,
    isDeleted: false,
    time: null,
    payload: null,
    ...overrides,
  };
}

describe("the timeout budget", () => {
  it("counts the team's timeouts in this half only", () => {
    const rows = [
      row(),
      row({ key: "2", teamLogId: 2 }),
      row({ key: "3", teamLogId: 3, half: 2 }),
      row({ key: "4", teamLogId: 4, team: "Wolves" }),
    ];

    expect(timeoutBudget(rows, "Ravens", 1, 2)).toEqual({
      perHalf: 2,
      used: 2,
      remaining: 0,
      exhausted: true,
    });
    expect(timeoutBudget(rows, "Ravens", 2, 2)).toMatchObject({ used: 1, remaining: 1 });
    expect(timeoutBudget(rows, "Wolves", 1, 2)).toMatchObject({ used: 1 });
  });

  it("gives a timeout back when its row is undone", () => {
    const rows = [row(), row({ key: "2", teamLogId: 2, isDeleted: true })];

    expect(timeoutBudget(rows, "Ravens", 1, 2)).toMatchObject({ used: 1 });
  });

  it("never reports a negative remainder", () => {
    const rows = [row(), row({ key: "2", teamLogId: 2 }), row({ key: "3", teamLogId: 3 })];

    const budget = timeoutBudget(rows, "Ravens", 1, 2);
    expect(budget.remaining).toBe(0);
    expect(budget.exhausted).toBe(true);
    expect(timeoutText(budget)).toBe("3/2");
  });
});
