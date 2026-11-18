import { describe, expect, it } from "vitest";

import { yardsNumber, yardsRangeError, yardsText, yardsValue } from "./yards";

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

/**
 * A distance has to fit the field the ball is on. `advance` clamps a spot, so
 * an entry running past a goal line used to be stored as the shorter play - a
 * different play than the one the official saw (field report 2026-11-18).
 */
describe("the field's limits for a distance", () => {
  const ten = { ballOn: 10, fieldLength: 50 };
  const atTheGoal = { ballOn: 45, fieldLength: 50 };

  it("accepts a play inside the field", () => {
    expect(yardsRangeError(8, ten)).toBeNull();
    expect(yardsRangeError(-10, ten)).toBeNull();
    expect(yardsRangeError(5, atTheGoal)).toBeNull();
  });

  it("accepts the exact distance to a goal line", () => {
    // the goal line is a touchdown, the own one a safety: both are plays
    expect(yardsRangeError(40, ten)).toBeNull();
    expect(yardsRangeError(-10, ten)).toBeNull();
    expect(yardsRangeError(5, atTheGoal)).toBeNull();
  });

  it("refuses a gain past the opponent's goal line", () => {
    expect(yardsRangeError(10, atTheGoal)).toBe(
      "Der Raumgewinn reicht über die Endzone hinaus (höchstens 5 Yards).",
    );
    expect(yardsRangeError(41, ten)).toContain("höchstens 40 Yards");
  });

  it("refuses a loss past the own goal line", () => {
    expect(yardsRangeError(-11, ten)).toBe(
      "Der Raumverlust reicht in die eigene Endzone (höchstens 10 Yards).",
    );
    expect(yardsRangeError(-12.5, ten)).toContain("höchstens 10 Yards");
  });

  it("does not judge a spot it does not know", () => {
    expect(yardsRangeError(99, { ballOn: null, fieldLength: 50 })).toBeNull();
    expect(yardsRangeError(Number.NaN, ten)).toBeNull();
  });
});
