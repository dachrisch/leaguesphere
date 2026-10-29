import { describe, expect, it } from "vitest";

import type { GameLog, GameLogEvent, GameLogTeam } from "../api/types";
import type { StoredOp } from "../offline/types";
import { replayOps } from "./optimistic";

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

function log(overrides: Partial<GameLog> = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(),
    away: team({ id: 2, name: "Wolves" }),
    ...overrides,
  };
}

function event(overrides: Partial<GameLogEvent> = {}): GameLogEvent {
  return {
    id: 10,
    sequence: 1,
    seq: 1,
    team: "Ravens",
    event: "Touchdown",
    player: 7,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-10-26T12:00:00Z",
    ...overrides,
  };
}

function op(overrides: Partial<StoredOp> = {}): StoredOp {
  return {
    id: `op-${overrides.seq ?? 1}`,
    gameId: 42,
    kind: "event",
    payload: { events: [] },
    createdAt: 1_000,
    attempts: 0,
    deviceId: "device-a",
    seq: 1,
    failed: false,
    failedReason: null,
    failedAt: null,
    ...overrides,
  };
}

/** A queued play: one submission of envelopes. */
function play(
  events: unknown[],
  overrides: Partial<StoredOp> = {},
): StoredOp {
  return op({ payload: { events }, ...overrides });
}

describe("replayOps", () => {
  it("adds a touchdown and its conversion to the server score", () => {
    const base = log({
      home: team({ score: 7, firsthalf: { score: 7, entries: [] } }),
    });

    const { log: shown } = replayOps(base, [
      play([
        { type: "score", code: "touchdown", side: "home", player: 23, period: 1 },
        { type: "score", code: "pat1", side: "home", player: 23, period: 1 },
      ]),
    ]);

    expect(shown.home.score).toBe(14);
    expect(shown.home.firsthalf.score).toBe(14);
    expect(shown.away.score).toBe(0);
    // Newest first, like the server: a conversion has the higher pk.
    expect(shown.events?.slice(0, 2).map((entry) => entry.event)).toEqual([
      "1-Extra-Punkt",
      "Touchdown",
    ]);
    expect(shown.events?.[0].id).toBeLessThan(0);
    // The base is never mutated.
    expect(base.home.score).toBe(7);
    expect(base.events).toEqual([]);
  });

  it("scores nothing for a touchdown without a jersey, like the server", () => {
    const { log: shown } = replayOps(log(), [
      play([{ type: "score", code: "touchdown", side: "home", period: 1 }]),
    ]);

    expect(shown.home.score).toBe(0);
    expect(shown.events?.[0].player).toBeNull();
  });

  it("mirrors the server's jersey coercion before scoring", () => {
    // The server truncates a decimal string and drops anything outside
    // 0..32767 to `None` (which scores nothing). A promise the server does not
    // keep is worse than a late score.
    const { log: shown } = replayOps(log(), [
      play([
        { type: "score", code: "touchdown", side: "home", player: 51.85, period: 1 },
        { type: "score", code: "touchdown", side: "home", player: 40000, period: 1 },
        { type: "score", code: "touchdown", side: "home", player: -1, period: 1 },
        { type: "score", code: "touchdown", side: "home", player: "23", period: 1 },
      ]),
    ]);

    // 51.85 -> 51 (6 points); 40000 and -1 are dropped (0 each); "23" -> 23.
    expect(shown.home.score).toBe(12);
    expect((shown.events ?? []).map((entry) => entry.player)).toEqual([
      23,
      null,
      null,
      51,
    ]);
  });

  it("marks a pending correction's whole group deleted and takes its points back", () => {
    const base = log({
      events: [
        event({ id: 11, sequence: 2, seq: 2, event: "1-Extra-Punkt", player: 23 }),
        event({ id: 10, sequence: 2, seq: 2, player: 23 }),
      ],
      home: team({ score: 7, firsthalf: { score: 7, entries: [] } }),
    });

    const { log: shown } = replayOps(base, [
      play(
        [{ type: "correction", code: "undo", payload: { undo_of: 2 } }],
        { kind: "correction" },
      ),
    ]);

    expect(shown.events?.every((entry) => entry.isDeleted === true)).toBe(true);
    expect(shown.home.score).toBe(0);
  });

  it("ignores a correction whose target is not in the base log", () => {
    const base = log({ home: team({ score: 6 }) });

    const { log: shown } = replayOps(base, [
      play(
        [{ type: "correction", code: "undo", payload: { undo_of: 99 } }],
        { kind: "correction" },
      ),
    ]);

    expect(shown.home.score).toBe(6);
    expect(shown.events).toEqual([]);
  });

  it("applies the last queued possession and the half-time marker", () => {
    const { log: shown } = replayOps(log({ isFirstHalf: true }), [
      op({ seq: 1, kind: "possession", payload: { events: [{ type: "possession", code: "away", side: "away" }] } }),
      op({ seq: 2, kind: "halftime", payload: { events: [{ type: "period", code: "half_time", side: null }] } }),
    ]);

    expect(shown.inPossession).toBe("Wolves");
    expect(shown.isFirstHalf).toBe(false);
    expect(shown.events?.[0].event).toBe("2. Halbzeit gestartet");
  });

  it("maps every synthetic row back to its op for a local undo", () => {
    const { log: shown, opByEventId } = replayOps(log(), [
      play(
        [
          { type: "score", code: "touchdown", side: "home", player: 7, period: 1 },
          { type: "score", code: "pat2", side: "home", player: 7, period: 1 },
        ],
        { id: "queued-1" },
      ),
    ]);

    for (const entry of shown.events ?? []) {
      expect(opByEventId.get(entry.id)).toBe("queued-1");
    }
  });

  it("returns the base unchanged when the server sent no events list", () => {
    const base: GameLog = {
      gameId: 42,
      isFirstHalf: true,
      home: team(),
      away: team(),
    };

    const { log: shown } = replayOps(base, [
      play([{ type: "series", code: "first_down", side: "home", period: 1 }]),
    ]);

    expect(shown).toBe(base);
  });
});

describe("replayOps edge payloads", () => {
  it("drops a jersey that is not a finite number", () => {
    const { log: shown } = replayOps(log(), [
      play([
        { type: "score", code: "touchdown", side: "home", player: "keine", period: 1 },
      ]),
    ]);

    expect(shown.home.score).toBe(0);
    expect(shown.events?.[0].player).toBeNull();
  });

  it("scores nothing for a code it does not know", () => {
    const { log: shown } = replayOps(log(), [
      play([{ type: "score", code: "tor", side: "home", player: 5, period: 1 }]),
    ]);

    expect(shown.home.score).toBe(0);
    expect(shown.events).toEqual([]);
  });

  it("adds no score when the envelope names no side", () => {
    const { log: shown } = replayOps(log(), [
      play([{ type: "score", code: "touchdown", player: 23, period: 2 }]),
    ]);

    expect(shown.home.score).toBe(0);
    expect(shown.away.score).toBe(0);
    // The row is still shown, credited to no team.
    expect(shown.events?.[0].team).toBeNull();
    expect(shown.events?.[0].half).toBe(2);
  });

  it("gives the ball to either team and clears it", () => {
    const toWolves = replayOps(log(), [
      op({ kind: "possession", payload: { events: [{ type: "possession", code: "away", side: "away" }] } }),
    ]);
    expect(toWolves.log.inPossession).toBe("Wolves");

    const cleared = replayOps(log(), [
      op({ kind: "possession", payload: { events: [{ type: "possession", code: "" }] } }),
    ]);
    expect(cleared.log.inPossession).toBeNull();
  });

  it("replays a legacy delete by team_log_id and skips rows that are already gone", () => {
    const base = log({
      home: team({
        score: 6,
        firsthalf: { score: 6, entries: [] },
      }),
      events: [
        event({ id: 10, isDeleted: true, player: 7 }),
        event({ id: 11, sequence: 2, seq: 2, event: "Touchdown", player: 7 }),
      ],
    });
    const { log: shown } = replayOps(base, [
      op({ kind: "delete", payload: { team_log_id: 10 } }),
      op({ seq: 2, kind: "delete", payload: { team_log_id: 11 } }),
    ]);

    const rows = shown.events ?? [];
    expect(rows.find((row) => row.id === 10)?.isDeleted).toBe(true);
    expect(rows.find((row) => row.id === 11)?.isDeleted).toBe(true);
    // Only the live row's touchdown came back off the score.
    expect(shown.home.score).toBe(0);
  });

  it("ignores a delete for a row of no team", () => {
    const base = log({
      events: [
        event({ id: 5, team: null, sequence: 0, seq: null, event: "Spiel gestartet" }),
      ],
    });
    const { log: shown } = replayOps(base, [
      op({ kind: "delete", payload: { team_log_id: 5 } }),
    ]);

    expect(shown.events?.[0].isDeleted).toBe(true);
    expect(shown.home.score).toBe(0);
    expect(shown.away.score).toBe(0);
  });

  it("does not replay a half-time into the second half twice", () => {
    const base = log({ isFirstHalf: false });
    const { log: shown } = replayOps(base, [
      op({ kind: "halftime", payload: { events: [{ type: "period", code: "half_time" }] } }),
    ]);

    expect(shown.isFirstHalf).toBe(false);
    expect(shown.events).toEqual([]);
  });

  it("replays a first-half half-time with the marker row", () => {
    const { log: shown, opByEventId } = replayOps(log(), [
      op({ kind: "halftime", payload: { events: [{ type: "period", code: "half_time" }] } }),
    ]);

    expect(shown.isFirstHalf).toBe(false);
    expect(shown.events?.[0].event).toBe("2. Halbzeit gestartet");
    expect(opByEventId.size).toBe(1);
  });

  it("translates a queue entry written before slice 2", () => {
    // A tab that was open across the update still holds the old play shape; a
    // reload must not lose those taps or show them differently.
    const { log: shown } = replayOps(log(), [
      op({
        payload: {
          gameId: 42,
          team: "Ravens",
          half: 1,
          event: [{ name: "Touchdown", player: 23 }],
        },
      }),
    ]);

    expect(shown.home.score).toBe(6);
    expect(shown.events?.[0].event).toBe("Touchdown");
  });

  it("translates a legacy possession entry (team name) with the log", () => {
    const { log: shown } = replayOps(log(), [
      op({ kind: "possession", payload: { team: "Wolves" } }),
    ]);

    expect(shown.inPossession).toBe("Wolves");
  });
});

describe("replayOps team resolution", () => {
  it("credits the away team and ignores a side-free play", () => {
    const { log: shown } = replayOps(log(), [
      play(
        [{ type: "score", code: "touchdown", side: "away", player: 11, period: 2 }],
        { seq: 1 },
      ),
      play(
        [{ type: "score", code: "touchdown", player: 12, period: 1 }],
        { seq: 2, id: "op-unbekannt" },
      ),
    ]);

    expect(shown.away.score).toBe(6);
    expect(shown.away.secondhalf.score).toBe(6);
    expect(shown.home.score).toBe(0);
    expect(shown.events).toHaveLength(2);
  });
});
