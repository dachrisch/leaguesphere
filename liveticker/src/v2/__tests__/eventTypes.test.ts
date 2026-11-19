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

  it("falls back to the neutral code for an unknown type", () => {
    expect(eventMeta("something-new")).toEqual({ code: "•", label: null });
  });

  it("extracts the detail without guessing the event type", () => {
    expect(eventDetail("Run: #11 - 12 Yards · Tackle #4")).toBe(
      "12 Yards · Tackle #4",
    );
    expect(eventDetail("Spiel gestartet")).toBe("");
  });

  it("uses the expected codes for the core events", () => {
    expect(eventMeta("touchdown").code).toBe("TD");
    expect(eventMeta("extra_point").code).toBe("XP");
    expect(eventMeta("run").code).toBe("LA");
    expect(eventMeta("pass").code).toBe("PA");
    expect(eventMeta("field_goal").code).toBe("FG");
    expect(eventMeta("safety").code).toBe("SF");
    expect(eventMeta("interception").code).toBe("IN");
    expect(eventMeta("penalty").code).toBe("ST");
    expect(eventMeta("timeout").code).toBe("AZ");
    expect(eventMeta("period_half").code).toBe("HZ");
    expect(eventMeta("period_start").code).toBe("AN");
  });
});
