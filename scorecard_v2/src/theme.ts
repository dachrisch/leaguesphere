/**
 * Light/dark/auto theme for the scorecard.
 *
 * The setting is stored per device (an official may keep a bright phone in the
 * sun and a dark one in the evening) and applied to `<html data-theme>` as the
 * *resolved* value, so CSS only ever matches `light` or `dark`. `auto` follows
 * the operating system and is re-applied when the OS switches.
 *
 * Storage and `matchMedia` are both optional: private mode or an embedded
 * webview without them must not stop the app from mounting.
 */

export type Theme = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "scorecard-v2-theme";

/** The order the header toggle cycles through. */
export const THEME_ORDER: readonly Theme[] = ["auto", "light", "dark"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    // Storage can throw when it is disabled entirely.
    return null;
  }
}

function persist(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A full or blocked storage keeps the theme for this session only.
  }
}

function darkMediaQuery(): MediaQueryList | null {
  try {
    return typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia(DARK_QUERY)
      : null;
  } catch {
    return null;
  }
}

/** The saved setting; an unknown or unreadable value means `auto`. */
export function getTheme(): Theme {
  const stored = readStored();
  return stored === "light" || stored === "dark" || stored === "auto"
    ? stored
    : "auto";
}

/** What `theme` means right now: explicit, or the OS preference for auto. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") {
    return theme;
  }
  return darkMediaQuery()?.matches === true ? "dark" : "light";
}

/**
 * Write the resolved theme to the document. Also records the chosen mode in
 * `data-theme-choice` for debugging; CSS keys off the resolved value.
 */
export function applyTheme(theme: Theme = getTheme()): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeChoice = theme;
    root.style.colorScheme = resolved;
  }
  return resolved;
}

/** Persist and apply in one step (the toggle's action). */
export function setTheme(theme: Theme): ResolvedTheme {
  persist(theme);
  return applyTheme(theme);
}

/** auto → light → dark → auto. */
export function nextTheme(theme: Theme): Theme {
  const index = THEME_ORDER.indexOf(theme);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? "auto";
}

/**
 * Apply the saved theme and keep `auto` in sync with the OS.
 *
 * Returns the unsubscribe function for tests and for a future hot reload.
 */
export function initTheme(): () => void {
  applyTheme();
  const query = darkMediaQuery();
  if (query === null || typeof query.addEventListener !== "function") {
    return () => undefined;
  }
  const onChange = (): void => {
    // An explicit choice ignores the OS; only auto follows it.
    if (getTheme() === "auto") {
      applyTheme("auto");
    }
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
