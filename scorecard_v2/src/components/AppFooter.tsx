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
 * Mirrors the main app's footer: the product line plus Impressum and
 * Datenschutz. The links open in a new tab so leaving the field app never
 * discards an in-progress game. Not a control: the screen keeps its CTA.
 */
export default function AppFooter() {
  const version = appVersion();

  return (
    <footer className="app-footer">
      <span className="app-footer-brand">
        <Football className="app-footer-icon" size={15} />
        <span className="app-footer-name">LeagueSphere</span>
        <span>
          {" · Scorecard v2"}
          {version === null ? null : ` · v${version}`}
        </span>
      </span>
      <span className="app-footer-legal">
        <a href="https://www.bumbleflies.de/impressum" rel="noopener noreferrer" target="_blank">
          Impressum
        </a>
        <span aria-hidden="true">·</span>
        <a href="https://www.bumbleflies.de/datenschutz" rel="noopener noreferrer" target="_blank">
          Datenschutz
        </a>
      </span>
    </footer>
  );
}
