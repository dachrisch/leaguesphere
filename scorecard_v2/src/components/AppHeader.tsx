import type { ReactNode } from "react";

import ThemeToggle from "./ThemeToggle";
import UserAvatar from "./UserAvatar";
import { ChevronLeft, Football } from "./icons";

interface AppHeaderProps {
  kicker: string;
  title: string;
  /** One context line; a node when it carries inline art (team logos). */
  sub?: ReactNode;
  /** Renders a back button when the flow can go back. */
  onBack?: () => void;
  /** Renders the logout action (shared field devices). */
  onLogout?: () => void;
  /**
   * Compact status chip for the top bar (the sync badge), placed before the
   * theme switch and the logout action. Everything that does not fit in the
   * bar belongs on the screen, not in the header.
   */
  badge?: ReactNode;
}

/**
 * Screen chrome: the navigation bar (back, status, avatar, theme, logout), the
 * LeagueSphere brand line with the kicker, one title and an optional context
 * line. The theme switch lives here so it is reachable from every screen,
 * including the loading and error panels.
 *
 * The bar is icon-only except for the German "Abmelden": at 360px it still
 * holds a back button, the sync chip, the avatar, the theme switch and the
 * logout action without scrolling sideways.
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
          <UserAvatar />
          <ThemeToggle />
          {onLogout === undefined ? null : (
            <button
              className="appbar-btn appbar-logout"
              onClick={onLogout}
              type="button"
            >
              Abmelden
            </button>
          )}
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
