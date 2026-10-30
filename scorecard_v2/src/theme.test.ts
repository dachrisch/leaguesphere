import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_ORDER,
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  initTheme,
  nextTheme,
  resolveTheme,
  setTheme,
} from "./theme";

interface FakeQuery {
  matches: boolean;
  media: string;
  listeners: Set<(event: MediaQueryListEvent) => void>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

/** A minimal matchMedia whose listeners the test can fire. */
function fakeMatchMedia(matches: boolean): {
  query: FakeQuery;
  change: (next: boolean) => void;
} {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query: FakeQuery = {
    matches,
    media: "(prefers-color-scheme: dark)",
    listeners,
    addEventListener: vi.fn(
      (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") {
          listeners.add(listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change") {
          listeners.delete(listener);
        }
      },
    ),
  };
  return {
    query,
    change: (next: boolean) => {
      query.matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

function root(): HTMLElement {
  return document.documentElement;
}

beforeEach(() => {
  localStorage.clear();
  delete root().dataset.theme;
  delete root().dataset.themeChoice;
  root().style.colorScheme = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("theme storage", () => {
  it("defaults to auto when nothing is stored", () => {
    expect(getTheme()).toBe("auto");
  });

  it("reads every valid stored theme and ignores garbage", () => {
    for (const theme of THEME_ORDER) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      expect(getTheme()).toBe(theme);
    }
    localStorage.setItem(THEME_STORAGE_KEY, "blue");
    expect(getTheme()).toBe("auto");
  });

  it("falls back to auto when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getTheme()).toBe("auto");
  });

  it("keeps working for this session when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });

    expect(setTheme("dark")).toBe("dark");
    expect(root().dataset.theme).toBe("dark");
  });
});

describe("resolving and applying", () => {
  it("uses an explicit theme without asking the OS", () => {
    const media = vi.fn();
    vi.stubGlobal("matchMedia", media);

    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(media).not.toHaveBeenCalled();
  });

  it("resolves auto from the OS, and light when matchMedia is absent", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => fakeMatchMedia(true).query),
    );
    expect(resolveTheme("auto")).toBe("dark");

    vi.stubGlobal("matchMedia", undefined);
    expect(resolveTheme("auto")).toBe("light");
  });

  it("treats a throwing matchMedia as light", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("unsupported");
      }),
    );

    expect(resolveTheme("auto")).toBe("light");
  });

  it("writes the resolved value and the chosen mode to the document", () => {
    expect(applyTheme("dark")).toBe("dark");
    expect(root().dataset.theme).toBe("dark");
    expect(root().dataset.themeChoice).toBe("dark");
    expect(root().style.colorScheme).toBe("dark");
  });

  it("persists and applies in setTheme", () => {
    setTheme("light");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(root().dataset.theme).toBe("light");
    expect(root().dataset.themeChoice).toBe("light");
  });

  it("cycles auto → light → dark → sun → auto", () => {
    expect(nextTheme("auto")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("sun");
    expect(nextTheme("sun")).toBe("auto");
  });

  it("applies the outdoor theme as its own light-scheme palette", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(setTheme("sun")).toBe("sun");
    expect(root().dataset.theme).toBe("sun");
    expect(root().style.colorScheme).toBe("light");
    expect(getTheme()).toBe("sun");
  });
});

describe("initTheme", () => {
  it("applies the stored theme and follows the OS while auto", () => {
    const media = fakeMatchMedia(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.query),
    );

    const stop = initTheme();
    expect(root().dataset.theme).toBe("light");

    media.change(true);
    expect(root().dataset.theme).toBe("dark");

    stop();
    expect(media.query.removeEventListener).toHaveBeenCalled();
  });

  it("ignores OS changes once a theme was chosen explicitly", () => {
    const media = fakeMatchMedia(true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.query),
    );
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const stop = initTheme();
    expect(root().dataset.theme).toBe("light");

    media.change(true);
    expect(root().dataset.theme).toBe("light");
    stop();
  });

  it("returns a no-op unsubscribe without matchMedia events", () => {
    vi.stubGlobal("matchMedia", undefined);

    const stop = initTheme();

    expect(root().dataset.theme).toBe("light");
    expect(() => stop()).not.toThrow();
  });
});
