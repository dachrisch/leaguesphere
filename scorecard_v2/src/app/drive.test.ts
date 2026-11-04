import { describe, expect, it } from "vitest";

import type { LogRow } from "../components/EventLog";
import {
  advance,
  driveAfter,
  driveText,
  FIRST_AND_TEN,
  isTurnoverOnDowns,
  yardsOf,
} from "./drive";

function row(overrides: Partial<LogRow> = {}): LogRow {
  return {
    key: "e1",
    teamLogId: 1,
    seq: 1,
    sequence: 1,
    team: "Ravens",
    event: "Run",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-11-04T12:00:00Z",
    payload: { yards: 0 },
    ...overrides,
  };
}

function run(yards: number, team = "Ravens"): LogRow {
  return row({ team, payload: { yards } });
}

describe("advance", () => {
  it("moves the chains when the line to gain is reached", () => {
    expect(advance(FIRST_AND_TEN, 10)).toEqual(FIRST_AND_TEN);
    expect(advance(FIRST_AND_TEN, 25)).toEqual(FIRST_AND_TEN);
  });

  it("counts the down and the remaining distance", () => {
    expect(advance(FIRST_AND_TEN, 4)).toEqual({ down: 2, toGo: 6 });
    expect(advance({ down: 2, toGo: 6 }, 3)).toEqual({ down: 3, toGo: 3 });
  });

  it("ends the series on a fourth down short of the line", () => {
    expect(advance({ down: 4, toGo: 3 }, 1)).toEqual(FIRST_AND_TEN);
    expect(advance({ down: 4, toGo: 3 }, 3)).toEqual(FIRST_AND_TEN);
  });

  it("counts a loss backwards", () => {
    expect(advance(FIRST_AND_TEN, -4)).toEqual({ down: 2, toGo: 14 });
  });
});

describe("isTurnoverOnDowns", () => {
  it("is only true on fourth down short of the line", () => {
    expect(isTurnoverOnDowns({ down: 4, toGo: 3 }, 1)).toBe(true);
    expect(isTurnoverOnDowns({ down: 4, toGo: 3 }, 3)).toBe(false);
    expect(isTurnoverOnDowns({ down: 3, toGo: 3 }, 1)).toBe(false);
  });
});

describe("driveAfter", () => {
  it("starts at first and ten without plays", () => {
    expect(driveAfter([])).toEqual(FIRST_AND_TEN);
  });

  it("walks the plays from oldest to newest", () => {
    // The log is newest first: a 4-yard run, then a 3-yard run.
    const drive = driveAfter([run(3), run(4)]);

    expect(drive).toEqual({ down: 3, toGo: 3 });
  });

  it("ignores a deleted play, so an undo rewinds the series", () => {
    const deleted = run(4);
    deleted.isDeleted = true;

    expect(driveAfter([run(3), deleted])).toEqual({ down: 2, toGo: 7 });
  });

  it("starts over when the team changes", () => {
    // Newest first: the Ravens ran for 3, then the Wolves for 4.
    const drive = driveAfter([run(4, "Wolves"), run(3, "Ravens")]);

    expect(drive).toEqual({ down: 2, toGo: 6 });
  });

  it("starts over after a touchdown or a turnover", () => {
    // Newest first: the marker is the last thing that happened.
    expect(
      driveAfter([
        row({ key: "td", event: "Touchdown", payload: { yards: 6 } }),
        run(6),
      ]),
    ).toEqual(FIRST_AND_TEN);
    expect(
      driveAfter([row({ key: "to", event: "Turnover", cop: true }), run(8)]),
    ).toEqual(FIRST_AND_TEN);
  });

  it("starts over at half-time and overtime", () => {
    for (const event of ["2. Halbzeit gestartet", "Overtime startet"]) {
      expect(
        driveAfter([row({ key: "m", event, team: null }), run(5)]),
      ).toEqual(FIRST_AND_TEN);
    }
  });

  it("reads the yards from the structured payload", () => {
    expect(yardsOf(row({ payload: { yards: 8 } }))).toBe(8);
    expect(yardsOf(row({ payload: { yards: -5 } }))).toBe(-5);
    expect(yardsOf(row({ payload: null }))).toBe(0);
    expect(yardsOf(row({ payload: { yards: "8" } }))).toBe(0);
  });

  it("counts a pass and a sack like any other play", () => {
    // Newest first: a 6-yard pass, then a 5-yard sack.
    const drive = driveAfter([
      row({ key: "sack", event: "Sack", payload: { yards: -5 } }),
      row({ key: "pass", event: "Pass", payload: { yards: 6 } }),
    ]);

    expect(drive).toEqual({ down: 3, toGo: 9 });
  });
});

describe("driveText", () => {
  it("uses the officials' shorthand", () => {
    expect(driveText({ down: 1, toGo: 10 })).toBe("1st & 10");
    expect(driveText({ down: 2, toGo: 6 })).toBe("2nd & 6");
    expect(driveText({ down: 3, toGo: 4 })).toBe("3rd & 4");
    expect(driveText({ down: 4, toGo: 1 })).toBe("4th & 1");
  });
});
