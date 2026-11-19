import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  isDelayed,
  minutesUntil,
  selectFinishedGame,
  selectLiveGames,
  selectNextGame,
} from "../selectors";
import type { Game } from "../types";
import { game } from "./fixture";

beforeAll(() => {
  vi.stubEnv("TZ", "America/New_York");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const at = (iso: string) => new Date(iso);

describe("selectors", () => {
  it("finds live and finished games", () => {
    const finished: Game = { ...game, gameId: 2, status: "beendet" };
    expect(selectLiveGames([game, finished]).map((g) => g.gameId)).toEqual([1]);
    expect(selectFinishedGame([game, finished])?.gameId).toBe(2);
  });

  it("marks a scheduled game late after five absolute minutes", () => {
    const scheduled: Game = {
      ...game,
      status: "Geplant",
      scheduled_at: "2026-08-15T08:45:00+02:00",
    };
    expect(isDelayed(scheduled, at("2026-08-15T06:49:00+00:00"))).toBe(false);
    expect(isDelayed(scheduled, at("2026-08-15T06:50:00+00:00"))).toBe(true);
    expect(
      isDelayed(
        { ...scheduled, status: "1. Halbzeit" },
        at("2026-08-15T07:30:00+00:00"),
      ),
    ).toBe(false);
  });

  it("counts the minutes to the next kickoff in absolute time", () => {
    const next: Game = {
      ...game,
      status: "Geplant",
      scheduled_at: "2026-08-15T09:00:00+02:00",
    };
    expect(minutesUntil(next, at("2026-08-15T06:52:00+00:00"))).toBe(8);
    expect(
      minutesUntil({ ...next, scheduled_at: "x" }, at("2026-08-15T06:52:00+00:00")),
    ).toBeNull();
  });

  it("treats an unparsable kickoff as not late", () => {
    const broken: Game = { ...game, status: "Geplant", scheduled_at: "x" };
    expect(isDelayed(broken, at("2026-08-15T06:52:00+00:00"))).toBe(false);
  });

  it("ignores a game without a usable kickoff", () => {
    const missing: Game = { ...game, status: "Geplant", scheduled_at: "" };
    expect(isDelayed(missing, at("2026-08-15T06:52:00+00:00"))).toBe(false);
    expect(minutesUntil(missing, at("2026-08-15T06:52:00+00:00"))).toBeNull();
    expect(selectNextGame([missing], at("2026-08-15T06:52:00+00:00"))).toBeNull();
    expect(
      selectNextGame(
        [{ ...missing, status: "beendet" }],
        at("2026-08-15T06:52:00+00:00"),
      ),
    ).toBeNull();
  });

  it("falls back to the earliest kickoff when every game is late", () => {
    const late: Game = {
      ...game,
      gameId: 1,
      status: "Geplant",
      scheduled_at: "2026-08-15T08:45:00+02:00",
    };
    const later: Game = { ...late, gameId: 2, scheduled_at: "2026-08-15T09:00:00+02:00" };
    expect(selectNextGame([later, late], at("2026-08-15T08:00:00+00:00"))?.gameId).toBe(
      1,
    );
  });

  it("skips delayed games when choosing the next kickoff", () => {
    const late: Game = {
      ...game,
      gameId: 1,
      status: "Geplant",
      scheduled_at: "2026-08-15T08:45:00+02:00",
    };
    const next: Game = {
      ...game,
      gameId: 2,
      status: "Geplant",
      scheduled_at: "2026-08-15T09:00:00+02:00",
    };
    expect(
      selectNextGame([late, next], at("2026-08-15T06:52:00+00:00"))?.gameId,
    ).toBe(2);
  });
});
