import type { ReactNode } from "react";

import AppHeader from "./AppHeader";

interface ScreenProps {
  title: string;
  /** One context line; a node when it carries inline art (team logos). */
  sub?: ReactNode;
  /** Header back button, owned by the flow in App.tsx. */
  onBack?: () => void;
  /** Header logout action. */
  onLogout?: () => void;
  /** Compact status chip in the top bar (the sync badge). */
  badge?: ReactNode;
  /** Widen the shell at tablet/desk widths (the preparation screen only). */
  wide?: boolean;
  /** Screen-specific shell variant; its rules stay inert below 900px. */
  className?: string;
  children: ReactNode;
}

/**
 * App frame: the header stays put and `children` are the single scrollable
 * content area. Every screen (gameday list, game list, …) uses this instead of
 * repeating the `.app-shell` / `.app-header` / `<main>` markup.
 *
 * The frame is phone-width by default; `wide` opts a screen (the preparation)
 * into the widest tablet/desk measure. Every screen follows `--shell-width`,
 * which already grows on a tablet (see tokens.css).
 *
 * There is no footer: the scroll area takes every pixel below the bar, and the
 * LeagueSphere small print lives in the account menu.
 */
export default function Screen({
  title,
  sub,
  onBack,
  onLogout,
  badge,
  wide = false,
  className,
  children,
}: ScreenProps) {
  const shell = wide ? "app-shell app-shell-wide" : "app-shell";
  return (
    <div className={className === undefined ? shell : `${shell} ${className}`}>
      <AppHeader
        badge={badge}
        onBack={onBack}
        onLogout={onLogout}
        sub={sub}
        title={title}
      />
      <main className="vscroll">{children}</main>
    </div>
  );
}
