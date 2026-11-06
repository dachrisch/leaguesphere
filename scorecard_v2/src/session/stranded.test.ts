import { describe, expect, it } from "vitest";

import type { GameLog } from "../api/types";
import type { StoredOp } from "../offline/types";
import {
  isStranded,
  strandedNotice,
  strandedOpTitle,
  strandedScoreNote,
  strandedScores,
} from "./stranded";

function log(home: number, away: number): GameLog {
  const team = (id: number, name: string, score: number) => ({
    id,
    name,
    score,
    firsthalf: { score, entries: [] },
    secondhalf: { score: 0, entries: [] },
  });
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(1, "Ravens", home),
    away: team(2, "Wolves", away),
  };
}

function op(overrides: Partial<StoredOp> = {}): StoredOp {
  return {
    id: "op-1",
    gameId: 42,
    kind: "event",
    payload: {
      events: [{ type: "score", code: "touchdown", side: "home", period: 1 }],
    },
    createdAt: 1,
    attempts: 0,
    seq: 1,
    failed: false,
    failedReason: null,
    failedAt: null,
    ...overrides,
  };
}

describe("isStranded", () => {
  it("is the lost lock with entries still on the device", () => {
    expect(isStranded({ paused: "device", pending: 16 })).toBe(true);
  });

  it("is not an empty queue or another pause", () => {
    expect(isStranded({ paused: "device", pending: 0 })).toBe(false);
    expect(isStranded({ paused: "auth", pending: 2 })).toBe(false);
    expect(isStranded({ paused: null, pending: 2 })).toBe(false);
  });
});

describe("stranded scores", () => {
  it("keeps the official score next to the device's own", () => {
    const scores = strandedScores(log(7, 0), log(13, 0));

    expect(scores).toEqual({
      officialHome: 7,
      officialAway: 0,
      deviceHome: 13,
      deviceAway: 0,
      differs: true,
    });
    expect(strandedScoreNote(scores)).toContain("13:0");
    expect(strandedScoreNote(scores)).toContain("nicht offiziell");
  });

  it("adds no note when the scores agree", () => {
    const scores = strandedScores(log(7, 0), log(7, 0));

    expect(scores.differs).toBe(false);
    expect(strandedScoreNote(scores)).toBeNull();
  });
});

describe("stranded wording", () => {
  it("names the count and that the entries are not official", () => {
    expect(strandedNotice(1)).toBe(
      "1 Eintrag nicht übertragen – nicht im offiziellen Spielbericht.",
    );
    expect(strandedNotice(16)).toContain("16 Einträge nicht übertragen");
    expect(strandedNotice(16)).toContain("nicht im offiziellen Spielbericht");
  });
});

describe("stranded entry titles", () => {
  it("names the event an op would write", () => {
    expect(strandedOpTitle(op())).toBe("Touchdown");
  });

  it("names a bare possession op by its kind", () => {
    expect(
      strandedOpTitle(
        op({
          kind: "possession",
          payload: {
            events: [{ type: "possession", code: "away", side: "away" }],
          },
        }),
      ),
    ).toBe("Ballbesitz");
  });

  it("falls back to the op kind for a row from an older build", () => {
    expect(strandedOpTitle(op({ payload: { team: "Ravens" } }))).toBe("Eintrag");
  });
});
