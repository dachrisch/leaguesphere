import type { ReactNode } from "react";

import AppFooter from "./AppFooter";
import AppHeader from "./AppHeader";

interface ScreenProps {
  kicker: string;
  title: string;
  /** One context line; a node when it carries inline art (team logos). */
  sub?: ReactNode;
  /** Header back button, owned by the flow in App.tsx. */
  onBack?: () => void;
  /** Header logout action. */
  onLogout?: () => void;
  /** Compact status chip in the top bar (the sync badge). */
  badge?: ReactNode;
  children: ReactNode;
}

/**
 * Phone-width app frame: the header stays put and `children` are the single
 * scrollable content area. Every screen (gameday list, game list, …) uses this
 * instead of repeating the `.app-shell` / `.app-header` / `<main>` markup.
 *
 * The LeagueSphere footer is a sibling of the scroll area, pinned to the
 * bottom of the screen: short screens do not leave it floating mid-page, and
 * long screens scroll behind/above it instead of pushing it out of view.
 */
export default function Screen({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
  badge,
  children,
}: ScreenProps) {
  return (
    <div className="app-shell">
      <AppHeader
        badge={badge}
        kicker={kicker}
        onBack={onBack}
        onLogout={onLogout}
        sub={sub}
        title={title}
      />
      <main className="vscroll">{children}</main>
      <AppFooter />
    </div>
  );
}
