import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerServiceWorker,
  shouldRegisterServiceWorker,
} from "./serviceWorker";

function stubServiceWorker(register: (url: string) => Promise<unknown>): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
}

describe("registerServiceWorker", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/scorecard/v2/");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
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

  it("does not register outside the app scope", () => {
    const register = vi.fn(() => Promise.resolve());
    stubServiceWorker(register);
    window.history.replaceState({}, "", "/scorecard/");

    registerServiceWorker();

    expect(register).not.toHaveBeenCalled();
  });

  it("does not register from the Vite dev server", () => {
    const register = vi.fn(() => Promise.resolve());
    stubServiceWorker(register);

    expect(
      shouldRegisterServiceWorker({ pathname: "/scorecard/v2/", port: "3004" }),
    ).toBe(false);
    expect(
      shouldRegisterServiceWorker({ pathname: "/scorecard/v2", port: "" }),
    ).toBe(true);
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
