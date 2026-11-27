import { describe, expect, it } from "vitest";

import type { Game, GameLogEventInput } from "../../api/types";
import { IgnoredWrite } from "../../components/sheets/errors";
import {
  addsJerseyLater,
  describeSaved,
  flipsPossession,
  secondHalfPossession,
  setupSide,
  trackingSubtitle,
  trackingTitle,
  writeTeam,
} from "./logic";

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: 42,
    stage: "Vorrunde",
    standing: "",
    field: 2,
    ...over,
  }) as Game;

const event = (name: string, input?: string, player?: number): GameLogEventInput => ({
  name,
  ...(input === undefined ? {} : { input }),
  ...(player === undefined ? {} : { player }),
});

describe("tracking titles (Phase 3 characterization)", () => {
  it("prefers the stage, then the standing, then the field", () => {
    expect(trackingTitle(game())).toBe("Feld 2 · Vorrunde");
    expect(trackingTitle(game({ stage: "  ", standing: "Finale" }))).toBe(
      "Feld 2 · Finale",
    );
    expect(trackingTitle(game({ stage: "", standing: "" }))).toBe("Feld 2");
  });

  it("joins optional header context parts", () => {
    expect(trackingSubtitle()).toBeUndefined();
    expect(trackingSubtitle("  ", "")).toBeUndefined();
    expect(trackingSubtitle("Herbsttag")).toBe("Herbsttag");
    expect(trackingSubtitle("Herbsttag", "Landesliga")).toBe(
      "Herbsttag · Landesliga",
    );
  });
});

describe("tracking helpers (Phase 3 characterization)", () => {
  it("recognises one-tap modes with a deferred jersey", () => {
    expect(addsJerseyLater("first")).toBe(true);
    expect(addsJerseyLater("interception")).toBe(true);
    expect(addsJerseyLater("turnover")).toBe(false);
  });

  it("flips possession unless every event keeps the ball", () => {
    expect(flipsPossession([])).toBe(false);
    expect(flipsPossession([event("First Down"), event("Spielzeit")])).toBe(false);
    expect(flipsPossession([event("First Down"), event("Turnover")])).toBe(true);
    expect(flipsPossession([event("Touchdown")])).toBe(false);
    expect(flipsPossession([event("1-Extra-Punkt")])).toBe(true);
  });

  it("reads a saved side from literal, name or legacy value", () => {
    expect(setupSide("home", "Ravens", "Wolves")).toBe("home");
    expect(setupSide("AWAY", "Ravens", "Wolves")).toBe("away");
    expect(setupSide(" ravens ", "Ravens", "Wolves")).toBe("home");
    expect(setupSide(" wolves ", "Ravens", "Wolves")).toBe("away");
    expect(setupSide("unknown", "Ravens", "Wolves")).toBeNull();
    expect(setupSide("Ravens", null, null)).toBeNull();
  });

  it("gives the second half to the team that did not receive the kickoff", () => {
    expect(secondHalfPossession(null, "Ravens", "Wolves")).toBeNull();
    expect(secondHalfPossession({ fhPossession: "home" }, "Ravens", "Wolves")).toBe(
      "Wolves",
    );
    expect(secondHalfPossession({ fhPossession: "Wolves" }, "Ravens", "Wolves")).toBe(
      "Ravens",
    );
    expect(secondHalfPossession({ fhPossession: "?" }, "Ravens", "Wolves")).toBeNull();
  });

  it("credits interceptions to the opponent and refuses writes without a ball", () => {
    expect(writeTeam([event("Touchdown")], "Ravens", "Wolves")).toBe("Ravens");
    expect(writeTeam([event("Interception")], "Ravens", "Wolves")).toBe("Wolves");
    expect(() => writeTeam([event("Touchdown")], null, "Wolves")).toThrow(IgnoredWrite);
    expect(() => writeTeam([event("Interception")], "Ravens", null)).toThrow(IgnoredWrite);
  });

  it("describes saved entries with their confirmation, jersey or time", () => {
    expect(describeSaved([])).toBe("Eintrag gespeichert");
    expect(describeSaved([event("Touchdown")])).toBe("Touchdown gespeichert");
    expect(describeSaved([event("Safety (+1)")])).toBe("Safety gespeichert");
    expect(describeSaved([event("Safety (+2)")])).toBe("Safety gespeichert");
    expect(describeSaved([event("Unbekannt")])).toBe("Unbekannt gespeichert");
    expect(describeSaved([event("Touchdown", "18:04")])).toBe(
      "Touchdown gespeichert · 18:04",
    );
    expect(describeSaved([event("Strafe", undefined, 7)])).toBe(
      "Strafe gespeichert · #7",
    );
  });
});
