import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  forgetBreak,
  formatBreak,
  HALFTIME_BREAK_SECONDS,
  readBreakStart,
  rememberBreakStart,
  secondsLeft,
} from "./break";

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("the half-time break", () => {
  it("is remembered per game", () => {
    expect(readBreakStart(1)).toBeNull();

    rememberBreakStart(1, 1000);
    rememberBreakStart(2, 2000);

    expect(readBreakStart(1)).toBe(1000);
    expect(readBreakStart(2)).toBe(2000);

    forgetBreak(1);
    expect(readBreakStart(1)).toBeNull();
    expect(readBreakStart(2)).toBe(2000);
  });

  it("ignores a stored value that is not a number", () => {
    globalThis.localStorage.setItem("scorecard:v2:break:7", "kaputt");
    expect(readBreakStart(7)).toBeNull();
  });

  it("counts down from the full break and never goes negative", () => {
    const start = 10_000;

    expect(secondsLeft(start, start)).toBe(HALFTIME_BREAK_SECONDS);
    expect(secondsLeft(start, start + 60_000)).toBe(
      HALFTIME_BREAK_SECONDS - 60,
    );
    expect(secondsLeft(start, start + 60 * 60 * 1000)).toBe(0);
    // A clock that went backwards must not produce a longer break.
    expect(secondsLeft(start, start - 5000)).toBe(HALFTIME_BREAK_SECONDS);
  });

  it("formats mm:ss", () => {
    expect(formatBreak(300)).toBe("05:00");
    expect(formatBreak(61)).toBe("01:01");
    expect(formatBreak(0)).toBe("00:00");
  });
});
