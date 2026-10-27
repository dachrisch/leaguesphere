import { useState } from "react";

import {
  getTheme,
  nextTheme,
  setTheme,
  type Theme,
} from "../theme";
import { Auto, Moon, Sun } from "./icons";

/** The visible short label next to the icon. */
const SHORT: Record<Theme, string> = {
  auto: "Auto",
  light: "Hell",
  dark: "Dunkel",
};

/** The accessible name and tooltip: "Design: automatisch". */
const LABEL: Record<Theme, string> = {
  auto: "Design: automatisch",
  light: "Design: hell",
  dark: "Design: dunkel",
};

const ICON = { auto: Auto, light: Sun, dark: Moon } as const;

/**
 * Header control that cycles auto → light → dark.
 *
 * It shows the *chosen* mode, not the resolved colour: "Auto" stays "Auto"
 * even while the OS is dark. The icon and the label change together, so the
 * state is never colour-only.
 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const Icon = ICON[theme];

  const cycle = (): void => {
    const next = nextTheme(theme);
    setTheme(next);
    setThemeState(next);
  };

  return (
    <button
      aria-label={LABEL[theme]}
      className="appbar-btn theme-toggle"
      onClick={cycle}
      title={LABEL[theme]}
      type="button"
    >
      <Icon className="appbar-icon" size={16} />
      {SHORT[theme]}
    </button>
  );
}
