// Undoing an entry that handed the ball over must put it back where the entry
// found it. The rule lives here so the screen only has to pass the row.
import { describe, expect, it } from "vitest";

import type { GameLog } from "../api/types";
import type { LogRow } from "../components/EventLog";
import { undoPossessionTeam } from "./possessionUndo";

function log(): GameLog {
  const team = (id: number, name: string) => ({
    id,
    name,
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
  });
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(1, "Ravens"),
    away: team(2, "Wolves"),
  };
}

function row(overrides: Partial<LogRow> = {}): LogRow {
  return {
    key: "e1",
    teamLogId: 1,
    seq: 1,
    sequence: 1,
    team: "Ravens",
    event: "Turnover",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: null,
    payload: null,
    ...overrides,
  };
}

describe("undoPossessionTeam", () => {
  it("returns the ball to the team that had it before a turnover", () => {
    expect(undoPossessionTeam(row(), log())).toBe("Ravens");
  });

  it("returns the ball to the scoring team after a touchdown", () => {
    expect(
      undoPossessionTeam(row({ event: "Touchdown" }), log()),
    ).toBe("Ravens");
  });

  it("returns the ball to the opponent after an interception", () => {
    // The interception row names the *new* offence (the interceptor).
    expect(
      undoPossessionTeam(row({ event: "Interception" }), log()),
    ).toBe("Wolves");
  });

  it("returns the ball to the opponent after a safety", () => {
    expect(
      undoPossessionTeam(row({ event: "Safety (+2)" }), log()),
    ).toBe("Wolves");
  });

  it("changes nothing for an entry that keeps the ball", () => {
    expect(undoPossessionTeam(row({ event: "Pass" }), log())).toBeNull();
  });

  it("changes nothing for a row already deleted", () => {
    expect(undoPossessionTeam(row({ isDeleted: true }), log())).toBeNull();
  });

  it("changes nothing when the row names no team of this game", () => {
    expect(undoPossessionTeam(row({ team: "Fremde" }), log())).toBeNull();
  });
});
