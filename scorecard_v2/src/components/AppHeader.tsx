import type { ReactNode } from "react";

import AccountMenu from "./AccountMenu";
import { ChevronLeft } from "./icons";

interface AppHeaderProps {
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
 * Screen chrome: one steel bar with back, the title and its context line, the
 * status chip and the account menu. There is no brand line and no title band
 * below it: on the sideline every pixel of height belongs to the screen's own
 * content. The theme choice, **Abmelden** and the legal links live in the
 * account menu, so the same actions are reachable from every screen, including
 * the loading and error panels.
 */
export default function AppHeader({
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
        <div className="appbar-title">
          <h1 className="app-title">{title}</h1>
          {sub === undefined ? null : <p className="app-sub">{sub}</p>}
        </div>
        <div className="appbar-right">
          {badge === undefined ? null : (
            <span className="appbar-badge">{badge}</span>
          )}
          <AccountMenu onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
