import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatClock } from "../format";
import { selectLiveGame } from "../selectors";
import type { Game, Team } from "../types";

beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Berlin");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("format", () => {
  it("formats a UTC timestamp as German 24h time", () => {
    expect(formatClock("2026-08-15T12:05:00+00:00")).toBe("14:05");
  });

  it("passes scheduled wall-clock times through", () => {
    expect(formatClock("10:00")).toBe("10:00");
    expect(formatClock(null)).toBe("—");
    expect(formatClock("not-a-date")).toBe("not-a-date");
  });


});

describe("selectLiveGame", () => {
  const base: Omit<Game, "gameId" | "status" | "home" | "away"> = {
    standing: "Gruppe 1",
    stage: "Vorrunde",
    field: 1,
    league: "Testliga",
    gameday: { id: 1, name: "Testtag", address: "" },
    time: "10:00",
    scheduled_at: "2026-08-15T10:00:00+02:00",
    tick_count: 0,
    ticks: [],
  };
  const team: Team = {
    name: "A",
    full_name: "A",
    score: 0,
    isInPossession: false,
    logo: null,
    fh: null,
    sh: null,
  };

  it("picks the game in a half", () => {
    const games: Game[] = [
      { ...base, gameId: 1, status: "Geplant", home: team, away: team },
      { ...base, gameId: 2, status: "2. Halbzeit", home: team, away: team },
    ];
    expect(selectLiveGame(games)?.gameId).toBe(2);
  });

  it("returns null when nothing is live", () => {
    const games: Game[] = [
      { ...base, gameId: 1, status: "beendet", home: team, away: team },
    ];
    expect(selectLiveGame(games)).toBeNull();
  });
});
