import { afterEach, describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "./serviceWorker";

function stubServiceWorker(register: (url: string) => Promise<unknown>): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
}

describe("registerServiceWorker", () => {
  afterEach(() => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    vi.restoreAllMocks();
  });

  it("registers the worker from the app scope", () => {
    const register = vi.fn(() => Promise.resolve());
    stubServiceWorker(register);

    registerServiceWorker();

    expect(register).toHaveBeenCalledWith("/scorecard/v2/sw.js");
  });

  it("does nothing when the browser has no service worker support", () => {
    expect("serviceWorker" in navigator).toBe(false);

    expect(() => registerServiceWorker()).not.toThrow();
  });

  it("warns instead of failing when registration is rejected", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubServiceWorker(() => Promise.reject(new Error("insecure context")));

    registerServiceWorker();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      "Scorecard v2: service worker registration failed",
      expect.any(Error),
    );
  });
});
