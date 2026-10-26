import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEVICE_ID_STORAGE_KEY, getDeviceId } from "./device";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/;

describe("getDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("returns the same id on every call and persists it", () => {
    const first = getDeviceId();

    expect(first).not.toBe("");
    expect(getDeviceId()).toBe(first);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(first);
  });

  it("reuses an id stored by a previous visit", () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, "existing-device");

    expect(getDeviceId()).toBe("existing-device");
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe("existing-device");
  });

  it("replaces a blank stored value", () => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, "   ");

    const id = getDeviceId();

    expect(id).not.toBe("   ");
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it("asks crypto.randomUUID when the browser has it", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-a444-555555555555");
    vi.stubGlobal("crypto", { randomUUID });

    expect(getDeviceId()).toBe("11111111-2222-4333-a444-555555555555");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back to timestamp and Math.random without randomUUID", () => {
    vi.stubGlobal("crypto", {});

    const id = getDeviceId();

    expect(id).toMatch(UUID);
    expect(getDeviceId()).toBe(id);
  });

  it("still returns an id when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    const id = getDeviceId();

    expect(id).not.toBe("");
    expect(getDeviceId()).not.toBe("");
  });
});
