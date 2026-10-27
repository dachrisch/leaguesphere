import { useState } from "react";

import {
  getThemePreference,
  nextTheme,
  setThemePreference,
  themeLabel,
  type ThemePreference,
} from "../theme";
import { AutoIcon, MoonIcon, SunIcon } from "./icons";

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") return <SunIcon size={16} />;
  if (preference === "dark") return <MoonIcon size={16} />;
  return <AutoIcon size={16} />;
}

function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(
    getThemePreference
  );
  const label = themeLabel(preference);

  const cycle = () => {
    const next = nextTheme(preference);
    setThemePreference(next);
    setPreference(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Design: ${label}`}
      title={`Design: ${label}`}
      onClick={cycle}
    >
      <ThemeIcon preference={preference} />
      <span>{label}</span>
    </button>
  );
}

export default ThemeToggle;
