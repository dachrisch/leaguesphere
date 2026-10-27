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
    payload: {},
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

describe("replayOps", () => {
  it("adds a touchdown and its conversion to the server score", () => {
    const base = log({ home: team({ score: 7, firsthalf: { score: 7, entries: [] } }) });

    const { log: shown } = replayOps(base, [
      op({
        payload: {
          gameId: 42,
          team: "Ravens",
          half: 1,
          event: [
            { name: "Touchdown", player: 23 },
            { name: "1-Extra-Punkt", player: 23 },
          ],
        },
      }),
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
      op({ payload: { team: "Ravens", half: 1, event: [{ name: "Touchdown" }] } }),
    ]);

    expect(shown.home.score).toBe(0);
    expect(shown.events?.[0].player).toBeNull();
  });

  it("marks a pending delete and takes its points back", () => {
    const base = log({
      events: [event({ id: 10, sequence: 2, player: 23 })],
      home: team({ score: 6 }),
    });

    const { log: shown } = replayOps(base, [
      op({ kind: "delete", payload: { sequence: 2 } }),
    ]);

    expect(shown.events?.[0].isDeleted).toBe(true);
    expect(shown.home.score).toBe(0);
  });

  it("does not delete the excluded events sharing sequence 0", () => {
    const base = log({
      events: [
        event({ id: 12, sequence: 0, event: "Strafe", player: null }),
        event({ id: 11, sequence: 0, event: "Auszeit", player: null }),
      ],
    });

    const { log: shown } = replayOps(base, [
      op({ kind: "delete", payload: { sequence: 0 } }),
    ]);

    expect(shown.events?.every((entry) => entry.isDeleted === false)).toBe(true);
  });

  it("applies the last queued possession and the half-time marker", () => {
    const { log: shown } = replayOps(log({ isFirstHalf: true }), [
      op({ seq: 1, kind: "possession", payload: { team: "Wolves" } }),
      op({ seq: 2, kind: "halftime", payload: {} }),
    ]);

    expect(shown.inPossession).toBe("Wolves");
    expect(shown.isFirstHalf).toBe(false);
    expect(shown.events?.[0].event).toBe("2. Halbzeit gestartet");
  });

  it("maps every synthetic row back to its op for a local undo", () => {
    const { log: shown, opByEventId } = replayOps(log(), [
      op({
        id: "queued-1",
        payload: {
          team: "Ravens",
          half: 1,
          event: [{ name: "Touchdown", player: 7 }, { name: "2-Extra-Punkte", player: 7 }],
        },
      }),
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
      op({ payload: { team: "Ravens", half: 1, event: [{ name: "First Down" }] } }),
    ]);

    expect(shown).toBe(base);
  });
});
