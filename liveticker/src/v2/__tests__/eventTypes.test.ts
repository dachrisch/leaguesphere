import { describe, expect, it } from "vitest";

import {
  BACKEND_TYPES,
  EVENT_META,
  eventDetail,
  eventMeta,
} from "../eventTypes";

describe("eventTypes", () => {
  it("maps every backend type to a code and a German label", () => {
    for (const type of BACKEND_TYPES) {
      const meta = EVENT_META[type];
      expect(meta.code.length).toBeGreaterThan(0);
      if (type !== "other") {
        expect(meta.label).toBeTruthy();
      }
    }
  });

  it("lists exactly the types the backend can send", () => {
    expect([...BACKEND_TYPES].sort()).toEqual(
      [
        "touchdown",
        "extra_point",
        "overtime_score",
        "safety",
        "turnover",
        "interception",
        "first_down",
        "penalty",
        "clock",
        "timeout",
        "pass",
        "pass_incomplete",
        "run",
        "sack",
        "challenge",
        "field_position",
        "period_start",
        "period_half",
        "period_overtime",
        "period_end",
        "other",
      ].sort(),
    );
  });

  it("falls back to the neutral code for an unknown type", () => {
    expect(eventMeta("something-new")).toEqual({ code: "•", label: null });
  });

  it("extracts the detail with the player and the down/position", () => {
    expect(eventDetail("Run: #11 - 12 Yards · Tackle #4")).toBe(
      "#11 - 12 Yards · Tackle #4",
    );
    expect(eventDetail("First Down - 12 Yards · 2nd & M · A17")).toBe(
      "12 Yards · 2nd & M · A17",
    );
    expect(
      eventDetail("1-Extra-Punkt: #11 - nicht verwandelt · Tackle #4"),
    ).toBe("#11 - nicht verwandelt · Tackle #4");
    expect(eventDetail("Challenge - Passspiel geprüft")).toBe(
      "Passspiel geprüft",
    );
  });

  it("keeps a clock as the detail and never splits inside it", () => {
    expect(eventDetail("Auszeit - 11:30")).toBe("11:30");
    expect(eventDetail("Spielzeit - 05:00")).toBe("05:00");
    expect(eventDetail("Auszeit - 11:30 · Heim")).toBe("11:30 · Heim");
    expect(eventDetail("11:30")).toBe("");
    expect(eventDetail("05:00")).toBe("");
  });

  it("has no detail when the payload only carries the label", () => {
    expect(eventDetail("First Down")).toBe("");
    expect(eventDetail("Spiel gestartet")).toBe("");
  });

  it("uses the expected codes for the core events", () => {
    expect(eventMeta("touchdown").code).toBe("TD");
    expect(eventMeta("extra_point").code).toBe("XP");
    expect(eventMeta("run").code).toBe("LA");
    expect(eventMeta("pass").code).toBe("PA");
    expect(eventMeta("safety").code).toBe("SF");
    expect(eventMeta("interception").code).toBe("IN");
    expect(eventMeta("penalty").code).toBe("ST");
    expect(eventMeta("timeout").code).toBe("AZ");
    expect(eventMeta("period_half").code).toBe("HZ");
    expect(eventMeta("period_start").code).toBe("AN");
  });
});
