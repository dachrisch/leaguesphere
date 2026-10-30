export type ThemePreference = "auto" | "light" | "dark";

/** Shared with scorecard v2 so both apps keep one choice on the same origin. */
export const THEME_STORAGE_KEY = "scorecard-v2-theme";

const THEME_ORDER: ThemePreference[] = ["auto", "light", "dark"];

export function getThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "auto" || stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Private mode / blocked storage: fall through to auto.
  }
  return "auto";
}

export function nextTheme(preference: ThemePreference): ThemePreference {
  const index = THEME_ORDER.indexOf(preference);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = preference;
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Keep the in-memory choice even when persistence is unavailable.
  }
  applyTheme(preference);
}

export function themeLabel(preference: ThemePreference): string {
  if (preference === "light") return "Hell";
  if (preference === "dark") return "Dunkel";
  return "Auto";
}

/** Applies the stored theme and re-applies "auto" when the OS preference flips. */
export function initTheme(): () => void {
  applyTheme(getThemePreference());

  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia?.("(prefers-color-scheme: dark)");
  } catch {
    media = undefined;
  }
  const onChange = () => {
    if (getThemePreference() === "auto") {
      applyTheme("auto");
    }
  };
  media?.addEventListener?.("change", onChange);

  return () => media?.removeEventListener?.("change", onChange);
}
