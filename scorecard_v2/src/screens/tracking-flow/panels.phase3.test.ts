import { describe, expect, it } from "vitest";

import type { Side } from "./logic";
import {
  composerDisabled,
  halftimeDisabled,
  penaltyDisabled,
  touchdownLabel,
} from "./panels";

const openTry = { team: "Ravens", jersey: 7 };

function baseGating() {
  return {
    posting: false,
    possessionPending: false,
    halftimePending: false,
    finished: false,
    readOnly: false,
    possessionSide: "home" as Side,
    possessionName: "Ravens",
    pendingPat: null as typeof openTry | null,
  };
}

function baseHalftime() {
  return {
    pendingPat: null as typeof openTry | null,
    halftimePending: false,
    posting: false,
    possessionPending: false,
    undoKey: null as string | null,
    readOnly: false,
  };
}

describe("tracking panel gating (Phase 3 characterization)", () => {
  it("keeps the penalty flag reachable only when every other guard is clear", () => {
    const base = baseGating();
    expect(penaltyDisabled(base)).toBe(false);
    // An open try deliberately does not disable the flag.
    expect(penaltyDisabled({ ...base, pendingPat: openTry })).toBe(false);

    for (const flag of [
      "posting",
      "possessionPending",
      "halftimePending",
      "finished",
      "readOnly",
    ] as const) {
      expect(penaltyDisabled({ ...base, [flag]: true })).toBe(true);
    }
    expect(penaltyDisabled({ ...base, possessionSide: null })).toBe(true);
    expect(penaltyDisabled({ ...base, possessionName: null })).toBe(true);
    expect(penaltyDisabled({ ...base, possessionSide: "away" })).toBe(false);
  });

  it("locks every scoring tile while a try or a write is pending", () => {
    const base = baseGating();
    expect(composerDisabled(base)).toBe(false);
    expect(composerDisabled({ ...base, pendingPat: openTry })).toBe(true);

    for (const flag of [
      "posting",
      "possessionPending",
      "halftimePending",
      "finished",
      "readOnly",
    ] as const) {
      expect(composerDisabled({ ...base, [flag]: true })).toBe(true);
    }
    expect(composerDisabled({ ...base, possessionSide: null })).toBe(true);
    expect(composerDisabled({ ...base, possessionName: null })).toBe(true);
    expect(composerDisabled({ ...base, possessionSide: "away" })).toBe(false);
  });

  it("names the touchdown for the team in possession, or generically", () => {
    expect(touchdownLabel(null)).toBe("Touchdown");
    expect(touchdownLabel("Ravens")).toBe("Touchdown Ravens");
    expect(touchdownLabel("")).toBe("Touchdown ");
  });

  it("waits for in-flight possession/undo writes before starting the half", () => {
    const base = baseHalftime();
    expect(halftimeDisabled(base)).toBe(false);

    for (const flag of [
      "halftimePending",
      "posting",
      "possessionPending",
      "readOnly",
    ] as const) {
      expect(halftimeDisabled({ ...base, [flag]: true })).toBe(true);
    }
    expect(halftimeDisabled({ ...base, undoKey: "row-1" })).toBe(true);
    expect(halftimeDisabled({ ...base, pendingPat: openTry })).toBe(true);
    expect(halftimeDisabled({ ...base, undoKey: null, pendingPat: null })).toBe(
      false,
    );
  });
});
