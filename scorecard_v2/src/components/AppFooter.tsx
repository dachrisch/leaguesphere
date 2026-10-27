import { Football } from "./icons";

/** The build version the Django shell renders; the static offline shell omits it. */
const VERSION_META = 'meta[name="app-version"]';

/** `5.0.2-rc.2` from `<meta name="app-version">`, or `null` without one. */
export function appVersion(): string | null {
  const content = document
    .querySelector(VERSION_META)
    ?.getAttribute("content")
    ?.trim();
  return content === undefined || content === "" ? null : content;
}

/**
 * LeagueSphere's small print under every screen.
 *
 * Not a link and not a control: the field app is opened from a bookmark, so the
 * footer only says where the official is. Screens place it after their scroll
 * content — the tracking screen above its action bar — so it never covers a CTA
 * and never adds a scrollbar of its own.
 */
export default function AppFooter() {
  const version = appVersion();

  return (
    <footer className="app-footer">
      <Football className="app-footer-icon" size={15} />
      <span className="app-footer-brand">LeagueSphere</span>
      <span>
        {" · Scorecard v2"}
        {version === null ? null : ` · v${version}`}
      </span>
    </footer>
  );
}
