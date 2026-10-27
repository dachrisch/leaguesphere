import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AppFooter from "./AppFooter";

/** Put (or remove) the shell's version meta between tests. */
function setVersionMeta(version: string | null): void {
  document
    .querySelectorAll('meta[name="app-version"]')
    .forEach((meta) => meta.remove());
  if (version !== null) {
    const meta = document.createElement("meta");
    meta.name = "app-version";
    meta.content = version;
    document.head.append(meta);
  }
}

afterEach(() => {
  cleanup();
  setVersionMeta(null);
});

describe("AppFooter", () => {
  it("names LeagueSphere and the app", () => {
    render(<AppFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("LeagueSphere · Scorecard v2");
    expect(footer.querySelector(".app-footer-icon")).not.toBeNull();
  });

  it("is not interactive", () => {
    render(<AppFooter />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appends the build version the shell rendered", () => {
    setVersionMeta("5.0.2-rc.2");
    render(<AppFooter />);

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "LeagueSphere · Scorecard v2 · v5.0.2-rc.2",
    );
  });

  it("leaves the version out when the shell has none", () => {
    setVersionMeta("   ");
    render(<AppFooter />);

    expect(screen.getByRole("contentinfo")).not.toHaveTextContent("v5");
  });
});
