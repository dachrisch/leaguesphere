import type { ReactNode } from "react";

import AppHeader from "./AppHeader";

interface ScreenProps {
  kicker: string;
  title: string;
  sub?: string;
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
  children,
}: ScreenProps) {
  return (
    <div className="app-shell">
      <AppHeader kicker={kicker} sub={sub} title={title} />
      <main className="vscroll">{children}</main>
    </div>
  );
}
