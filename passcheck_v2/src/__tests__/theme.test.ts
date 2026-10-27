import { afterEach, beforeEach, expect, vi } from "vitest";

import {
  applyTheme,
  getThemePreference,
  initTheme,
  nextTheme,
  setThemePreference,
  THEME_STORAGE_KEY,
  themeLabel,
} from "../theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("cycles auto, light, dark and labels them", () => {
  expect(nextTheme("auto")).toBe("light");
  expect(nextTheme("light")).toBe("dark");
  expect(nextTheme("dark")).toBe("auto");
  expect(themeLabel("auto")).toBe("Auto");
  expect(themeLabel("light")).toBe("Hell");
  expect(themeLabel("dark")).toBe("Dunkel");
});

it("defaults to auto and persists an explicit choice", () => {
  expect(getThemePreference()).toBe("auto");

  setThemePreference("dark");

  expect(getThemePreference()).toBe("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

it("falls back to auto when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });

  expect(getThemePreference()).toBe("auto");
});

it("applies the stored theme and stops listening on cleanup", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener,
    removeEventListener,
  }));

  const cleanup = initTheme();

  expect(document.documentElement.dataset.theme).toBe("light");
  expect(addEventListener).toHaveBeenCalledTimes(1);

  cleanup();
  expect(removeEventListener).toHaveBeenCalledTimes(1);

  applyTheme("auto");
  expect(document.documentElement.dataset.theme).toBe("auto");
});
