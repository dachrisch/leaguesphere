interface AppHeaderProps {
  kicker: string;
  title: string;
  sub?: string;
  /** Renders a back button when the flow can go back. */
  onBack?: () => void;
  /** Renders the logout action (shared field devices). */
  onLogout?: () => void;
}

/** Screen chrome: kicker, one title and an optional context line. */
export default function AppHeader({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
}: AppHeaderProps) {
  const hasBar = onBack !== undefined || onLogout !== undefined;

  return (
    <header className="app-header">
      {hasBar ? (
        <div className="appbar">
          {onBack === undefined ? (
            <span />
          ) : (
            <button
              aria-label="Zurück"
              className="appbar-btn"
              onClick={onBack}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="appbar-icon"
                focusable="false"
                viewBox="0 0 16 16"
              >
                <path
                  d="M10 3L5 8l5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
              Zurück
            </button>
          )}
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
      ) : null}
      <p className="kicker">{kicker}</p>
      <h1 className="app-title">{title}</h1>
      {sub === undefined ? null : <p className="app-sub">{sub}</p>}
    </header>
  );
}
