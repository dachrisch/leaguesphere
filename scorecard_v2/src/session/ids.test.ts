// The client-generated op id: crypto's UUID when the browser has one, the
// UUID-shaped fallback on a plain-HTTP field device.
import { afterEach, describe, expect, it, vi } from "vitest";

import { newOpId } from "./ids";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("newOpId", () => {
  it("uses crypto.randomUUID when the browser has it", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-a444-555555555555",
    });

    expect(newOpId()).toBe("11111111-2222-4333-a444-555555555555");
  });

  it("falls back to a UUID-shaped id without a randomUUID", () => {
    vi.stubGlobal("crypto", {});

    const id = newOpId();

    expect(id).toMatch(UUID);
    // The variant nibble is the fixed one from the fallback, so two ids only
    // share it by construction, never by accident of the clock.
    expect(newOpId()).not.toBe(id);
  });

  it("falls back when there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);

    expect(newOpId()).toMatch(UUID);
  });

  it("fills the hex groups even when Math.random keeps returning zero", () => {
    vi.stubGlobal("crypto", {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(newOpId()).toMatch(/^[0-9a-f]{8}-0{4}-4000-a000-0{12}$/);
  });
});
