import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard the phone header: at 390px the league must remain a readable line
 * above the title instead of being hidden by a media query.
 */
const root = existsSync(path.join(process.cwd(), "src/v2/styles.css"))
  ? process.cwd()
  : path.join(process.cwd(), "liveticker");
const styles = readFileSync(path.join(root, "src/v2/styles.css"), "utf8");

describe("v2 topbar styles", () => {
  it("never hides the league", () => {
    expect(styles).not.toMatch(/\.lt-topbar-league[^{}]*\{[^{}]*display:\s*none/);
  });

  it("stacks league and title in the phone breakpoint", () => {
    const start = styles.indexOf("@media (max-width: 640px)");
    expect(start).toBeGreaterThan(-1);
    const block = styles.slice(start, styles.indexOf("\n}\n", start));

    expect(block).toMatch(/\.lt-topbar-id\s*\{[^}]*flex-direction:\s*column/);
    expect(block).toMatch(/\.lt-topbar-league\s*\{[^}]*font-size:\s*11px/);
  });

  it("keeps the title one ellipsised line", () => {
    expect(styles).toMatch(/\.lt-topbar-title\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(styles).toMatch(/\.lt-topbar-title\s*\{[^}]*white-space:\s*nowrap/);
  });
});
