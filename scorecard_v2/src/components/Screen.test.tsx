import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Screen from "./Screen";

describe("Screen", () => {
  it("gives the scroll area every pixel below the bar", () => {
    const { container } = render(
      <Screen title="Meine Spieltage">
        <p>Inhalt</p>
      </Screen>,
    );

    const shell = container.querySelector(".app-shell");
    const scroll = container.querySelector(".vscroll");
    expect(shell?.lastElementChild).toBe(scroll);
    expect(container.querySelector(".app-footer")).toBeNull();
  });

  it("only opts into the wider shell when the screen asks for it", () => {
    const narrow = render(
      <Screen title="Meine Spieltage">
        <p>Inhalt</p>
      </Screen>,
    );
    expect(
      narrow.container.querySelector(".app-shell")?.classList.contains(
        "app-shell-wide",
      ),
    ).toBe(false);
    narrow.unmount();

    const wide = render(
      <Screen title="Spiel vorbereiten" wide>
        <p>Inhalt</p>
      </Screen>,
    );
    expect(
      wide.container.querySelector(".app-shell")?.classList.contains(
        "app-shell-wide",
      ),
    ).toBe(true);
  });
});
