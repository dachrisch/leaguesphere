import { beforeEach, describe, expect, it } from "vitest";

import { getActorUsername, setActorUsername } from "./actor";

beforeEach(() => {
  setActorUsername(null);
});

describe("actor username", () => {
  it("remembers the signed-in name for a queued op", () => {
    setActorUsername("anna");

    expect(getActorUsername()).toBe("anna");
  });

  it("trims whitespace and treats a blank name as unknown", () => {
    setActorUsername("  anna  ");
    expect(getActorUsername()).toBe("anna");

    setActorUsername("   ");
    expect(getActorUsername()).toBeNull();
  });

  it("is null before the app knows the user", () => {
    expect(getActorUsername()).toBeNull();
  });
});
