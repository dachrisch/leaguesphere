import ThemeToggle from "./ThemeToggle";
import { ChevronLeft } from "./icons";

interface AppHeaderProps {
  kicker: string;
  title: string;
  sub?: string;
  /** Renders a back button when the flow can go back. */
  onBack?: () => void;
  /** Renders the logout action (shared field devices). */
  onLogout?: () => void;
}

/**
 * Screen chrome: the navigation bar (back, theme, logout), the kicker, one
 * title and an optional context line. The theme switch lives here so it is
 * reachable from every screen, including the loading and error panels.
 */
export default function AppHeader({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="appbar">
        <div className="appbar-left">
          {onBack === undefined ? null : (
            <button
              aria-label="Zurück"
              className="appbar-btn"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft className="appbar-icon" size={16} />
              Zurück
            </button>
          )}
        </div>
        <div className="appbar-right">
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
      <p className="kicker">{kicker}</p>
      <h1 className="app-title">{title}</h1>
      {sub === undefined ? null : <p className="app-sub">{sub}</p>}
    </header>
  );
}
