import { describe, expect, it } from "vitest";

import {
  isDelayed,
  minutesUntil,
  selectFinishedGame,
  selectLiveGames,
  selectNextGame,
} from "../selectors";
import type { Game } from "../types";
import { game } from "./fixture";

const at = (hhmm: string) => new Date(`2026-08-15T${hhmm}:00`);

describe("selectors", () => {
  it("finds live and finished games", () => {
    const finished: Game = { ...game, gameId: 2, status: "beendet" };
    expect(selectLiveGames([game, finished]).map((g) => g.gameId)).toEqual([1]);
    expect(selectFinishedGame([game, finished])?.gameId).toBe(2);
  });

  it("marks a scheduled game late after five minutes", () => {
    const scheduled: Game = { ...game, status: "Geplant", time: "08:45" };
    expect(isDelayed(scheduled, at("08:49"))).toBe(false);
    expect(isDelayed(scheduled, at("08:50"))).toBe(true);
    expect(isDelayed({ ...scheduled, status: "1. Halbzeit" }, at("09:30"))).toBe(false);
  });

  it("counts the minutes to the next kickoff", () => {
    const next: Game = { ...game, status: "Geplant", time: "09:00" };
    expect(minutesUntil(next, at("08:52"))).toBe(8);
    expect(minutesUntil({ ...next, time: "x" }, at("08:52"))).toBeNull();
  });

  it("skips delayed games when choosing the next kickoff", () => {
    const late: Game = { ...game, gameId: 1, status: "Geplant", time: "08:45" };
    const next: Game = { ...game, gameId: 2, status: "Geplant", time: "09:00" };
    expect(selectNextGame([late, next], at("08:52"))?.gameId).toBe(2);
  });
});
