import { describe, expect, it } from "vitest";

import { yardsNumber, yardsText, yardsValue } from "./yards";

/**
 * The yards field is typed on a phone by an official who says "seven and a
 * half": the comma is the separator, not a character to drop. Keeping the two
 * digit groups glued together read 7,5 as 75 (field report 2026-11-18).
 */
describe("the yards field", () => {
  it("reads a whole number", () => {
    expect(yardsValue("8")).toBe(8);
    expect(yardsValue("0")).toBe(0);
    expect(yardsValue(" 12 ")).toBe(12);
  });

  it("reads half yards written with a comma or a dot", () => {
    expect(yardsValue("7,5")).toBe(7.5);
    expect(yardsValue("7.5")).toBe(7.5);
    expect(yardsValue(",5")).toBe(0.5);
    expect(yardsValue("0,5")).toBe(0.5);
    expect(yardsValue("12,")).toBe(12);
  });

  it("keeps the sign of a loss", () => {
    expect(yardsValue("-5")).toBe(-5);
    expect(yardsValue("-1,5")).toBe(-1.5);
    expect(yardsValue("−3")).toBeNull();
  });

  it("refuses what is not a distance", () => {
    expect(yardsValue("")).toBeNull();
    expect(yardsValue("-")).toBeNull();
    expect(yardsValue(",")).toBeNull();
    expect(yardsValue("1a2")).toBeNull();
    expect(yardsValue("7,55")).toBeNull();
    expect(yardsValue("123")).toBeNull();
  });

  it("writes the distance the German way", () => {
    expect(yardsNumber(7.5)).toBe("7,5");
    expect(yardsNumber(7)).toBe("7");
    expect(yardsText(7.5)).toBe("7,5 Yards");
    expect(yardsText(2.5, { loss: true })).toBe("2,5 Yards Verlust");
  });
});
