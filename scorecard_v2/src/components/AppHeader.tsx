import type { ReactNode } from "react";

import AccountMenu from "./AccountMenu";
import { ChevronLeft, Football } from "./icons";

interface AppHeaderProps {
  kicker: string;
  title: string;
  /** One context line; a node when it carries inline art (team logos). */
  sub?: ReactNode;
  /** Renders a back button when the flow can go back. */
  onBack?: () => void;
  /** Renders the logout action inside the account menu (shared field devices). */
  onLogout?: () => void;
  /**
   * Compact status chip for the top bar (the sync badge), placed before the
   * account menu. Everything that does not fit in the bar belongs on the
   * screen, not in the header.
   */
  badge?: ReactNode;
}

/**
 * Screen chrome: the navigation bar (back, status, account menu), the
 * LeagueSphere brand line with the kicker, one title and an optional context
 * line. The theme choice and **Abmelden** live in the account menu, so the bar
 * stays three controls wide from 320px up and the same actions are reachable
 * from every screen, including the loading and error panels.
 */
export default function AppHeader({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
  badge,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="appbar">
        <div className="appbar-left">
          {onBack === undefined ? null : (
            <button
              aria-label="Zurück"
              className="appbar-btn appbar-iconbtn"
              onClick={onBack}
              title="Zurück"
              type="button"
            >
              <ChevronLeft className="appbar-icon" size={18} />
            </button>
          )}
        </div>
        <div className="appbar-right">
          {badge === undefined ? null : (
            <span className="appbar-badge">{badge}</span>
          )}
          <AccountMenu onLogout={onLogout} />
        </div>
      </div>
      <p className="app-meta">
        <span className="wordmark">
          <Football className="wordmark-icon" size={16} />
          <span className="wordmark-text">LeagueSphere</span>
        </span>
        <span aria-hidden="true" className="wordmark-sep">
          ·
        </span>
        <span className="kicker">{kicker}</span>
      </p>
      <h1 className="app-title">{title}</h1>
      {sub === undefined ? null : <p className="app-sub">{sub}</p>}
    </header>
  );
}
