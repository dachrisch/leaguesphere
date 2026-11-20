import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Guard against the root-level font URLs Vite emits without a base. */
describe("v2 build assets", () => {
  it("points every font url at the Django static output", () => {
    const root = existsSync(path.join(process.cwd(), "vite.config.v2.mjs"))
      ? process.cwd()
      : path.join(process.cwd(), "liveticker");
    const outDir = mkdtempSync(path.join(tmpdir(), "liveticker-v2-build-"));
    try {
      execFileSync(
        process.execPath,
        [
          path.join(root, "node_modules/vite/bin/vite.js"),
          "build",
          "--config",
          "vite.config.v2.mjs",
          "--outDir",
          outDir,
          "--emptyOutDir",
        ],
        { cwd: root, stdio: "pipe" },
      );
      const css = readFileSync(
        path.join(outDir, "liveticker-v2-style.css"),
        "utf8",
      );
      const fontUrls = [...css.matchAll(/url\(([^)]+)\)/g)]
        .map((match) => match[1].replace(/["']/g, ""))
        .filter((url) => /\.(woff2?|ttf|otf)$/.test(url));

      expect(fontUrls.length).toBeGreaterThan(0);
      for (const url of fontUrls) {
        expect(url.startsWith("/static/liveticker/v2/js/")).toBe(true);
      }
      expect(css).not.toMatch(/url\(["']?\/liveticker-v2-/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
