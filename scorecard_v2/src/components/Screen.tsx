import type { ReactNode } from "react";

import AppHeader from "./AppHeader";

interface ScreenProps {
  kicker: string;
  title: string;
  sub?: string;
  /** Header back button, owned by the flow in App.tsx. */
  onBack?: () => void;
  /** Header logout action. */
  onLogout?: () => void;
  children: ReactNode;
}

/**
 * Phone-width app frame: the header stays put and `children` are the single
 * scrollable content area. Every screen (gameday list, game list, …) uses this
 * instead of repeating the `.app-shell` / `.app-header` / `<main>` markup.
 */
export default function Screen({
  kicker,
  title,
  sub,
  onBack,
  onLogout,
  children,
}: ScreenProps) {
  return (
    <div className="app-shell">
      <AppHeader
        kicker={kicker}
        onBack={onBack}
        onLogout={onLogout}
        sub={sub}
        title={title}
      />
      <main className="vscroll">{children}</main>
    </div>
  );
}
