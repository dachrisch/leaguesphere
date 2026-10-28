import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerServiceWorker,
  reloadOnUpdate,
  shouldRegisterServiceWorker,
} from "./serviceWorker";

function stubServiceWorker(
  register: (url: string) => Promise<unknown>,
  controller: object | null = null,
): ReturnType<typeof vi.fn> {
  const addEventListener = vi.fn();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { addEventListener, controller, register },
  });
  return addEventListener;
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

  it("picks up a deploy by reloading once a new worker controls the page", () => {
    const addEventListener = stubServiceWorker(vi.fn(() => Promise.resolve()));

    registerServiceWorker();

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("listens for the new worker when the page already had one", () => {
    const addEventListener = stubServiceWorker(
      vi.fn(() => Promise.resolve()),
      {},
    );

    registerServiceWorker();

    expect(addEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
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


describe("reloadOnUpdate", () => {
  function container() {
    const listeners: Array<() => void> = [];
    return {
      listeners,
      addEventListener: vi.fn((type: string, handler: () => void) => {
        if (type === "controllerchange") {
          listeners.push(handler);
        }
      }),
      fire: () => listeners.forEach((handler) => handler()),
    };
  }

  it("reloads once when an updated worker takes control", () => {
    const sw = container();
    const reload = vi.fn();

    reloadOnUpdate(sw, true, reload);
    sw.fire();
    sw.fire();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on the first install", () => {
    const sw = container();
    const reload = vi.fn();

    reloadOnUpdate(sw, false, reload);
    sw.fire();

    expect(reload).not.toHaveBeenCalled();
    expect(sw.addEventListener).not.toHaveBeenCalled();
  });

  it("registers the listener when the page already had a worker", () => {
    const sw = container();
    reloadOnUpdate(sw, true, vi.fn());

    expect(sw.addEventListener).toHaveBeenCalledWith(
      "controllerchange",
      expect.any(Function),
    );
  });
});
