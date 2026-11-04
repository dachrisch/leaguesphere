import { describe, expect, it } from "vitest";

import type { LogRow } from "../components/EventLog";
import {
  advance,
  driveAfter,
  driveText,
  FIRST_AND_TEN,
  isTurnoverOnDowns,
  mirror,
  seriesAt,
  spotText,
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
    expect(advance(FIRST_AND_TEN, 4)).toEqual({
      down: 2,
      toGo: 6,
      ballOn: null,
      goal: false,
    });
    expect(advance({ down: 2, toGo: 6, ballOn: 40, goal: false }, 3)).toEqual({
      down: 3,
      toGo: 3,
      ballOn: 43,
      goal: false,
    });
  });

  it("ends the series on a fourth down short of the line", () => {
    expect(advance({ down: 4, toGo: 3, ballOn: 40, goal: false }, 1)).toEqual({
      down: 1,
      toGo: 10,
      ballOn: 59,
      goal: false,
    });
    expect(advance({ down: 4, toGo: 3, ballOn: 40, goal: false }, 3)).toEqual({
      down: 1,
      toGo: 10,
      ballOn: 43,
      goal: false,
    });
  });

  it("counts a loss backwards", () => {
    expect(advance(FIRST_AND_TEN, -4)).toEqual({
      down: 2,
      toGo: 14,
      ballOn: null,
      goal: false,
    });
  });

  it("moves the spot with the play", () => {
    const drive = advance(seriesAt(35), 8);

    expect(drive).toEqual({ down: 2, toGo: 2, ballOn: 43, goal: false });
  });

  it("turns goal-to-go when the spot is inside the ten", () => {
    const drive = advance(seriesAt(92), 6);

    expect(drive).toEqual({ down: 2, toGo: 2, ballOn: 98, goal: true });
    expect(driveText(drive)).toBe("2nd & Goal");
    expect(driveText(seriesAt(92))).toBe("1st & Goal");
  });

  it("keeps the goal line as the line to gain for the whole series", () => {
    const lost = advance(seriesAt(92), -5);

    expect(driveText(lost)).toBe("2nd & Goal");
    expect(lost.ballOn).toBe(87);
  });
});

describe("isTurnoverOnDowns", () => {
  it("is only true on fourth down short of the line", () => {
    expect(isTurnoverOnDowns({ down: 4, toGo: 3, ballOn: 40, goal: false }, 1)).toBe(
      true,
    );
    expect(isTurnoverOnDowns({ down: 4, toGo: 3, ballOn: 40, goal: false }, 3)).toBe(
      false,
    );
    expect(isTurnoverOnDowns({ down: 3, toGo: 3, ballOn: 40, goal: false }, 1)).toBe(
      false,
    );
  });
});

describe("driveAfter", () => {
  it("starts at first and ten without plays", () => {
    expect(driveAfter([])).toEqual(FIRST_AND_TEN);
  });

  it("walks the plays from oldest to newest", () => {
    // The log is newest first: a 4-yard run, then a 3-yard run.
    const drive = driveAfter([run(3), run(4)]);

    expect(drive).toEqual({ down: 3, toGo: 3, ballOn: null, goal: false });
  });

  it("ignores a deleted play, so an undo rewinds the series", () => {
    const deleted = run(4);
    deleted.isDeleted = true;

    expect(driveAfter([run(3), deleted])).toEqual({
      down: 2,
      toGo: 7,
      ballOn: null,
      goal: false,
    });
  });

  it("starts over when the team changes, at the mirrored spot", () => {
    // Newest first: the Ravens ran for 3 from their own 40, then the Wolves
    // took over on the Ravens' 43 (their own 57) and ran for 4.
    const drive = driveAfter([
      run(4, "Wolves"),
      run(3, "Ravens"),
      row({ key: "spot", event: "Feldposition", payload: { ballOn: 40 } }),
    ]);

    expect(drive).toEqual({ down: 2, toGo: 6, ballOn: 61, goal: false });
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

    expect(drive).toEqual({ down: 3, toGo: 9, ballOn: null, goal: false });
  });

  it("sets the spot from a Feldposition row", () => {
    const drive = driveAfter([
      run(-2),
      row({ key: "spot", event: "Feldposition", payload: { ballOn: 35 } }),
    ]);

    expect(drive).toEqual({ down: 2, toGo: 12, ballOn: 33, goal: false });
  });

  it("mirrors the spot for a turnover", () => {
    const drive = driveAfter([
      row({ key: "to", event: "Turnover", cop: true, team: "Wolves" }),
      run(6),
      row({ key: "spot", event: "Feldposition", payload: { ballOn: 40 } }),
    ]);

    expect(drive.ballOn).toBe(54);
    expect(drive.down).toBe(1);
  });
});

describe("spotText", () => {
  it("names the spot as the officials call it", () => {
    expect(spotText(35)).toBe("eigene 35");
    expect(spotText(60)).toBe("gegn. 40");
    expect(spotText(50)).toBe("Mittelfeld");
    expect(spotText(null)).toBeNull();
    expect(mirror(35)).toBe(65);
    expect(mirror(null)).toBeNull();
  });
});

describe("driveText", () => {
  it("uses the officials' shorthand", () => {
    expect(driveText({ down: 1, toGo: 10, ballOn: null, goal: false })).toBe(
      "1st & 10",
    );
    expect(driveText({ down: 2, toGo: 6, ballOn: 40, goal: false })).toBe(
      "2nd & 6",
    );
    expect(driveText({ down: 3, toGo: 4, ballOn: 43, goal: false })).toBe(
      "3rd & 4",
    );
    expect(driveText({ down: 4, toGo: 1, ballOn: 95, goal: true })).toBe(
      "4th & Goal",
    );
  });
});
