import { useState } from "react";

import { getTheme, setTheme, THEME_ORDER, type Theme } from "../theme";
import { Auto, Moon, Sun } from "./icons";

/** The visible label of each choice. */
const LABEL: Record<Theme, string> = {
  auto: "Auto",
  light: "Hell",
  dark: "Dunkel",
};

/** The tooltip: "Design: automatisch". */
const TITLE: Record<Theme, string> = {
  auto: "Design: automatisch",
  light: "Design: hell",
  dark: "Design: dunkel",
};

const ICON = { auto: Auto, light: Sun, dark: Moon } as const;

/**
 * The theme choice inside the account menu: Auto / Hell / Dunkel.
 *
 * Three visible options instead of the old cycling icon, because the menu has
 * room for the words and an explicit choice is quicker than cycling. The icon
 * carries the choice as well, so the state never rests on colour alone.
 * `theme.ts` owns storage and the resolved `data-theme`; this component only
 * reports the chosen mode.
 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  return (
    <div aria-label="Design" className="themegroup" role="group">
      {THEME_ORDER.map((option) => {
        const Icon = ICON[option];
        const selected = option === theme;
        return (
          <button
            aria-pressed={selected}
            className={selected ? "sel" : undefined}
            key={option}
            onClick={() => {
              setTheme(option);
              setThemeState(option);
            }}
            title={TITLE[option]}
            type="button"
          >
            <Icon className="themeicon" size={16} />
            <span>{LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
