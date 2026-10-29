import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Screen from "./Screen";

describe("Screen", () => {
  it("pins the LeagueSphere footer below the scroll area", () => {
    const { container } = render(
      <Screen kicker="Scorecard" title="Meine Spieltage">
        <p>Inhalt</p>
      </Screen>,
    );

    const shell = container.querySelector(".app-shell");
    const scroll = container.querySelector(".vscroll");
    const footer = container.querySelector(".app-footer");

    expect(shell).not.toBeNull();
    expect(scroll).not.toBeNull();
    expect(footer).not.toBeNull();
    // Sibling of the scroll region, last child of the shell: flex pins it to
    // the bottom instead of letting it ride under short content.
    expect(scroll?.contains(footer)).toBe(false);
    expect(shell?.lastElementChild).toBe(footer);
  });
});
