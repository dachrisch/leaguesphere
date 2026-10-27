import { describe, expect, it } from "vitest";

import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes one letter per part of a dotted or dashed name", () => {
    expect(initialsOf("scorecard.test")).toBe("ST");
    expect(initialsOf("scorecard-test")).toBe("ST");
    expect(initialsOf("scorecard_test")).toBe("ST");
    expect(initialsOf("score card")).toBe("SC");
  });

  it("keeps the first two parts and ignores the rest", () => {
    expect(initialsOf("max.mustermann.rhein")).toBe("MM");
  });

  it("takes the single letter of a one-word name", () => {
    expect(initialsOf("max")).toBe("M");
    expect(initialsOf("MAX")).toBe("M");
  });

  it("has no initials without a name", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
    expect(initialsOf("...")).toBe("");
    expect(initialsOf(null)).toBe("");
    expect(initialsOf(undefined)).toBe("");
  });

  it("survives surrounding separators and whitespace", () => {
    expect(initialsOf("  -scorecard-test-  ")).toBe("ST");
  });
});
