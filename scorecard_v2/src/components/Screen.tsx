import type { ReactNode } from "react";

import AppFooter from "./AppFooter";
import AppHeader from "./AppHeader";

interface ScreenProps {
  kicker: string;
  title: string;
  sub?: string;
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
 * The LeagueSphere footer is part of the scroll content, after the screen's own
 * last block, so it can never overlap a CTA or add a scrollbar of its own.
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
      <main className="vscroll">
        {children}
        <AppFooter />
      </main>
    </div>
  );
}
