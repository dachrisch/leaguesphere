import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { eventCode, formatClock, germanEventText } from "../format";
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

  it("maps the event vocabulary to the two-letter codes", () => {
    expect(eventCode("Touchdown: #7 - 45 Yards")).toBe("TD");
    expect(eventCode("1-Extra-Punkt: #7")).toBe("XP");
    expect(eventCode("Run: #11 - 12 Yards")).toBe("LA");
    expect(eventCode("Strafe - Fehlstart")).toBe("ST");
    expect(eventCode("Auszeit - 12:00")).toBe("AZ");
    expect(eventCode("2. Halbzeit gestartet")).toBe("HZ");
    expect(eventCode("Spiel gestartet")).toBe("AN");
    expect(eventCode("Unbekannt")).toBe("•");
  });

  it("uses German event names where the old text was English", () => {
    expect(germanEventText("Run: #11 - 12 Yards")).toBe("Lauf: #11 - 12 Yards");
    expect(germanEventText("1-Extra-Punkt: #7")).toBe("Extrapunkt: #7");
    expect(germanEventText("2-Extra-Punkte: #7")).toBe("2 Extrapunkte: #7");
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
