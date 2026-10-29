import { describe, expect, it } from "vitest";

import type { GameLog, GameLogTeam } from "../api/types";
import {
  coercePlayer,
  correctionEnvelope,
  displayOf,
  envelopesForWrite,
  halftimeEnvelope,
  possessionEnvelope,
  sideOfName,
} from "./events";

function team(overrides: Partial<GameLogTeam> = {}): GameLogTeam {
  return {
    id: 1,
    name: "Ravens",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
    ...overrides,
  };
}

const LOG: GameLog = {
  gameId: 42,
  isFirstHalf: true,
  home: team(),
  away: team({ id: 2, name: "Wolves" }),
};

function write(
  teamName: string,
  events: { name: string; player?: number; input?: string }[],
  half: 1 | 2 = 1,
) {
  return { gameId: 42, team: teamName, half, event: events };
}

describe("envelopesForWrite", () => {
  // The table lives in gameevents/service/legacy.py; these are the same rows.
  it("translates every play the sheets can submit", () => {
    const envelopes = envelopesForWrite(
      write("Ravens", [
        { name: "Touchdown", player: 23 },
        { name: "1-Extra-Punkt", player: 23 },
        { name: "2-Extra-Punkte", player: 23 },
        { name: "Overtime", player: 7 },
        { name: "Safety (+1)", player: 11 },
        { name: "Safety (+2)", player: 11 },
        { name: "Turnover" },
        { name: "Interception", player: 11 },
        { name: "First Down", player: 4 },
        { name: "Strafe", input: "Holding Defense" },
        { name: "Spielzeit", input: "12:34" },
        { name: "Auszeit", input: "3:05" },
      ], 2),
      LOG,
    );

    expect(envelopes).toEqual([
      { type: "score", code: "touchdown", side: "home", player: 23, period: 2 },
      { type: "score", code: "pat1", side: "home", player: 23, period: 2 },
      { type: "score", code: "pat2", side: "home", player: 23, period: 2 },
      { type: "score", code: "overtime", side: "home", player: 7, period: 2 },
      {
        type: "score",
        code: "safety",
        side: "home",
        player: 11,
        period: 2,
        payload: { points: 1 },
      },
      {
        type: "score",
        code: "safety",
        side: "home",
        player: 11,
        period: 2,
        payload: { points: 2 },
      },
      { type: "possession", code: "turnover", side: "home", player: null, period: 2 },
      {
        type: "possession",
        code: "interception",
        side: "home",
        player: 11,
        period: 2,
      },
      { type: "series", code: "first_down", side: "home", player: 4, period: 2 },
      { type: "penalty", code: "Holding Defense", side: "home", player: null, period: 2 },
      {
        type: "time",
        code: "clock",
        side: "home",
        player: null,
        period: 2,
        payload: { input: "12:34" },
      },
      {
        type: "timeout",
        code: "home",
        side: "home",
        player: null,
        period: 2,
        payload: { input: "3:05" },
      },
    ]);
  });

  it("resolves the side from the team name the sheets know", () => {
    const [envelope] = envelopesForWrite(
      write("Wolves", [{ name: "Touchdown", player: 9 }]),
      LOG,
    );

    expect(envelope.side).toBe("away");
  });

  it("refuses a team that is not in the log", () => {
    expect(() =>
      envelopesForWrite(write("Fremde", [{ name: "Touchdown" }]), LOG),
    ).toThrow("gehört nicht zu diesem Spiel");
  });

  it("coerces the jersey before it leaves the device", () => {
    const [envelope] = envelopesForWrite(
      write("Ravens", [{ name: "Touchdown", player: 51.85 }]),
      LOG,
    );

    expect(envelope.player).toBe(51);

    const [dropped] = envelopesForWrite(
      write("Ravens", [{ name: "Touchdown", player: 40000 }]),
      LOG,
    );
    expect(dropped.player).toBeNull();
  });

  it("keeps an unknown play's name so the server can refuse it by name", () => {
    const [envelope] = envelopesForWrite(
      write("Ravens", [{ name: "Notiz", player: 5 }]),
      LOG,
    );

    expect(envelope).toEqual({
      type: "score",
      code: "Notiz",
      side: "home",
      player: 5,
      period: 1,
    });
  });
});

describe("the single-event envelopes", () => {
  it("builds possession, half-time and undo", () => {
    expect(possessionEnvelope("away")).toEqual({
      type: "possession",
      code: "away",
      side: "away",
    });
    expect(halftimeEnvelope()).toEqual({
      type: "period",
      code: "half_time",
      side: null,
    });
    expect(correctionEnvelope(7)).toEqual({
      type: "correction",
      code: "undo",
      payload: { undo_of: 7 },
    });
  });
});

describe("displayOf", () => {
  it("names the row and its points", () => {
    expect(displayOf({ type: "score", code: "touchdown" })).toMatchObject({
      event: "Touchdown",
      value: 6,
    });
    expect(
      displayOf({ type: "score", code: "safety", payload: { points: 2 } }),
    ).toMatchObject({ event: "Safety (+2)", value: 2 });
    expect(displayOf({ type: "possession", code: "turnover" })).toMatchObject({
      event: "Turnover",
      cop: true,
    });
    expect(displayOf({ type: "penalty", code: "Holding" })).toMatchObject({
      event: "Strafe",
      excluded: true,
    });
    expect(displayOf({ type: "period", code: "half_time" })).toMatchObject({
      event: "2. Halbzeit gestartet",
      marker: true,
      excluded: true,
    });
    // A plain possession change and a correction write no row.
    expect(displayOf({ type: "possession", code: "home" }).event).toBeNull();
    expect(displayOf({ type: "correction", code: "undo" }).event).toBeNull();
  });

  it("refuses a safety without points instead of inventing a value", () => {
    expect(displayOf({ type: "score", code: "safety" }).event).toBeNull();
  });

  it("names the remaining plays the sheets can submit", () => {
    expect(displayOf({ type: "possession", code: "interception" })).toMatchObject(
      { event: "Interception", cop: true, value: 0 },
    );
    expect(displayOf({ type: "time", code: "clock" })).toMatchObject({
      event: "Spielzeit",
      excluded: true,
    });
    expect(displayOf({ type: "timeout", code: "home" })).toMatchObject({
      event: "Auszeit",
      excluded: true,
    });
    expect(displayOf({ type: "series", code: "first_down" })).toMatchObject({
      event: "First Down",
      excluded: true,
    });
    expect(displayOf({ type: "period", code: "start" }).event).toBe(
      "Spiel gestartet",
    );
    expect(displayOf({ type: "period", code: "end" }).event).toBe(
      "Spiel beendet",
    );
  });

  it("draws no row for a code it cannot render", () => {
    // Nothing to show beats a wrong row: the server refuses unknown codes.
    expect(displayOf({ type: "series", code: "second_down" }).event).toBeNull();
    expect(displayOf({ type: "period", code: "quarter" }).event).toBeNull();
    expect(displayOf({ type: "score", code: "tor" }).event).toBeNull();
    expect(displayOf({ type: "time", code: "clock" }).event).toBe("Spielzeit");
  });
});

describe("coercePlayer", () => {
  it("truncates, drops out-of-range and keeps an empty jersey empty", () => {
    expect(coercePlayer("51.85")).toBe(51);
    expect(coercePlayer(-1)).toBeNull();
    expect(coercePlayer(40000)).toBeNull();
    expect(coercePlayer("")).toBeNull();
    expect(coercePlayer(null)).toBeNull();
    expect(coercePlayer("keine")).toBeNull();
  });
});

describe("sideOfName", () => {
  it("matches the names in the log, case and space insensitive", () => {
    expect(sideOfName("  ravens ", LOG)).toBe("home");
    expect(sideOfName("Wolves", LOG)).toBe("away");
    expect(sideOfName("", LOG)).toBeNull();
    expect(sideOfName(undefined, LOG)).toBeNull();
    expect(sideOfName("Fremde", LOG)).toBeNull();
  });
});


describe("envelopesForWrite — the edges", () => {
  it("sends an empty code for a penalty without a name", () => {
    // The sheet always picks one; without it the server must refuse the event
    // (400) instead of writing a "Strafe" with no reason.
    const [envelope] = envelopesForWrite(write("Ravens", [{ name: "Strafe" }]), LOG);

    expect(envelope).toMatchObject({ type: "penalty", code: "" });
  });

  it("resolves a side even when the other team has no name", () => {
    const nameless: GameLog = {
      ...LOG,
      home: team({ name: null }),
    };

    expect(sideOfName("Wolves", nameless)).toBe("away");
    expect(sideOfName("Ravens", nameless)).toBeNull();
  });
});

describe("displayOf — an envelope without a code", () => {
  it("draws no row for a scored play, and still names a penalty", () => {
    expect(displayOf({ type: "score" }).event).toBeNull();
    // The penalty's *code* is its reason, shown as the row's detail; the row
    // itself is "Strafe" either way (the server refuses an empty code).
    expect(displayOf({ type: "penalty" }).event).toBe("Strafe");
  });
});
