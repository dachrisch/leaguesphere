import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  forgetQuarterbacks,
  readQuarterback,
  rememberQuarterback,
  setQuarterback,
} from "./quarterback";

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("the remembered quarterback", () => {
  it("is kept per game and side", () => {
    expect(readQuarterback(42, "home")).toBeNull();

    rememberQuarterback(42, "home", 12);
    rememberQuarterback(42, "away", 4);
    rememberQuarterback(43, "home", 9);

    expect(readQuarterback(42, "home")).toBe(12);
    expect(readQuarterback(42, "away")).toBe(4);
    expect(readQuarterback(43, "home")).toBe(9);
  });

  it("keeps the default when one play was thrown by another quarterback", () => {
    // the setup chose #12; a trick play's #23 applies to that play only
    rememberQuarterback(42, "home", 12);
    rememberQuarterback(42, "home", 23);

    expect(readQuarterback(42, "home")).toBe(12);
  });

  it("takes the first thrower of a game whose setup named none", () => {
    rememberQuarterback(42, "home", 23);
    rememberQuarterback(42, "home", 12);

    expect(readQuarterback(42, "home")).toBe(23);
  });

  it("is dropped when the game is over", () => {
    rememberQuarterback(42, "home", 12);
    rememberQuarterback(42, "away", 4);

    forgetQuarterbacks(42);

    expect(readQuarterback(42, "home")).toBeNull();
    expect(readQuarterback(42, "away")).toBeNull();
  });

  it("ignores a stored value that is not a number", () => {
    globalThis.localStorage.setItem("scorecard:v2:qb:42:home", "kaputt");

    expect(readQuarterback(42, "home")).toBeNull();
  });
});

describe("changing the default quarterback", () => {
  it("replaces a stored number", () => {
    rememberQuarterback(42, "home", 12);

    setQuarterback(42, "home", 23);

    expect(readQuarterback(42, "home")).toBe(23);
    // the other side and the other game keep what they had
    expect(readQuarterback(42, "away")).toBeNull();
  });

  it("stores one for a game that never had one", () => {
    setQuarterback(42, "away", 4);

    expect(readQuarterback(42, "away")).toBe(4);
  });

  it("unsets it so the next pass asks again", () => {
    rememberQuarterback(42, "home", 12);

    setQuarterback(42, "home", null);

    expect(readQuarterback(42, "home")).toBeNull();
  });
});
