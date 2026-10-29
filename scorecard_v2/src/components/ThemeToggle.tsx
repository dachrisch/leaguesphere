import { useState } from "react";

import {
  getTheme,
  nextTheme,
  setTheme,
  type Theme,
} from "../theme";
import { Auto, Moon, Sun } from "./icons";

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
 * Compact on purpose: the bar has to hold the back button, the sync chip, this
 * switch and "Abmelden" at 360px. The icon carries the state, the accessible
 * name and the tooltip carry the chosen mode ("Design: hell") — it shows the
 * *chosen* mode, not the resolved colour, so "automatisch" stays chosen while
 * the OS is dark. The icon changes with the choice, never colour alone.
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
      className="appbar-btn appbar-iconbtn theme-toggle"
      onClick={cycle}
      title={LABEL[theme]}
      type="button"
    >
      <Icon className="appbar-icon" size={18} />
    </button>
  );
}
