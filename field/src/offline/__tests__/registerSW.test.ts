import { beforeEach, expect, vi } from "vitest";

import { registerServiceWorker } from "../registerSW";

beforeEach(() => {
  vi.restoreAllMocks();
});

it("registers the worker with the field scope on load", () => {
  const register = vi.fn().mockResolvedValue({});
  vi.stubGlobal("navigator", { serviceWorker: { register } });

  registerServiceWorker();
  window.dispatchEvent(new Event("load"));

  expect(register).toHaveBeenCalledWith("/field/sw.js", { scope: "/field/" });
});

it("does nothing when service workers are unavailable", () => {
  vi.stubGlobal("navigator", {});

  expect(() => registerServiceWorker()).not.toThrow();
});
