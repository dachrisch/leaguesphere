import type { ReactNode } from "react";

import ThemeToggle from "./ThemeToggle";
import { ChevronLeftIcon } from "./icons";

type Props = {
  kicker: string;
  title: string;
  sub?: string;
  onBack?: () => void;
  onLogout?: () => void;
  badge?: ReactNode;
};

/**
 * Screen chrome: top bar (back, status, theme, logout) plus kicker/title/sub.
 * The theme switch lives here so every screen can reach it.
 */
function AppHeader({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
  badge,
}: Props) {
  return (
    <header className="app-header">
      <div className="appbar">
        <div className="appbar-left">
          {onBack && (
            <button
              type="button"
              className="appbar-btn appbar-iconbtn"
              aria-label="Zurück"
              title="Zurück"
              onClick={onBack}
            >
              <ChevronLeftIcon size={18} />
            </button>
          )}
        </div>
        <div className="appbar-right">
          {badge && <span className="appbar-badge">{badge}</span>}
          <ThemeToggle />
          {onLogout && (
            <button
              type="button"
              className="appbar-btn appbar-logout"
              onClick={onLogout}
            >
              Abmelden
            </button>
          )}
        </div>
      </div>

      <p className="kicker">{kicker}</p>
      <h1 className="app-title">{title}</h1>
      {sub && <p className="app-sub">{sub}</p>}
    </header>
  );
}

export default AppHeader;
