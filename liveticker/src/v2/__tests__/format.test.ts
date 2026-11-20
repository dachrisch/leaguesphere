import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatBerlinClock, formatClock } from "../format";
import {
  formatBerlinDate,
  halftimeLabel,
  shortTeamName,
  statusLabel,
  teamBadges,
} from "../format";
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

  it("formats the Berlin kickoff regardless of the viewer time zone", () => {
    vi.stubEnv("TZ", "America/New_York");
    expect(formatBerlinClock("2026-08-15T08:45:00+00:00")).toBe("10:45");
    vi.stubEnv("TZ", "Europe/Berlin");
  });

  it("handles a missing or unparsable kickoff", () => {
    expect(formatBerlinClock(null)).toBe("—");
    expect(formatBerlinClock("not-a-date")).toBe("not-a-date");
  });

  it("passes scheduled wall-clock times through", () => {
    expect(formatClock("10:00")).toBe("10:00");
    expect(formatClock(null)).toBe("—");
    expect(formatClock("not-a-date")).toBe("not-a-date");
  });

  it("formats a gameday date in Berlin", () => {
    expect(formatBerlinDate("2026-08-15T10:00:00+02:00")).toContain("15.08.2026");
    expect(formatBerlinDate(null)).toBe("");
    expect(formatBerlinDate("not-a-date")).toBe("");
  });

  it("uses the distinctive word for team badges", () => {
    expect(teamBadges("Demo Wolves", "Demo Eagles")).toEqual({
      home: "WO",
      away: "EA",
    });
    expect(teamBadges("Walldorf Wanderers", "Düsseldorf Firecats")).toEqual({
      home: "WA",
      away: "FI",
    });
    expect(teamBadges("Tigers", "Tigers")).toEqual({ home: "TI", away: "TG" });
    expect(teamBadges("Team A", "Team B")).toEqual({ home: "A", away: "B" });
  });

  it("uses the last word as the short team name", () => {
    expect(shortTeamName("Demo Wolves")).toBe("Wolves");
    expect(shortTeamName("Wolves")).toBe("Wolves");
  });

  it("shortens the live status and labels a final score", () => {
    expect(statusLabel("1. Halbzeit")).toBe("1. HZ");
    expect(statusLabel("2. Halbzeit")).toBe("2. HZ");
    expect(statusLabel("beendet")).toBe("Endstand");
    expect(statusLabel("Geplant")).toBe("Geplant");
  });

  it("labels both halves and dashes a missing score", () => {
    expect(
      halftimeLabel({ fh: 7, sh: 0 }, { fh: 6, sh: 3 }),
    ).toBe("1. HZ 7:6 · 2. HZ 0:3");
    expect(halftimeLabel({ fh: null, sh: null }, { fh: null, sh: null })).toBe("");
    expect(halftimeLabel({ fh: 7, sh: null }, { fh: null, sh: null })).toBe(
      "1. HZ 7:–",
    );
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
