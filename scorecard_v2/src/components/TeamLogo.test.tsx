import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeamLogosProvider } from "../app/teamLogos";
import TeamLogo from "./TeamLogo";

const LOGO = "https://example.test/media/teammanager/logos/ravens.png";

function renderLogo(
  name: string | null,
  logos: Map<string, string> = new Map(),
  className?: string,
) {
  return render(
    <TeamLogosProvider logos={logos}>
      <TeamLogo className={className} name={name} />
    </TeamLogosProvider>,
  );
}

describe("TeamLogo", () => {
  it("renders the team's logo as a decorative image", () => {
    const { container } = renderLogo(
      "Ravens",
      new Map([["ravens", LOGO]]),
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", LOGO);
    // The name is adjacent text; repeating it in `alt` would say it twice.
    expect(image).toHaveAttribute("alt", "");
  });

  it("matches the team name regardless of case and surrounding space", () => {
    const { container } = renderLogo(
      "  nürnberg renegades ",
      new Map([["nürnberg renegades", LOGO]]),
    );

    expect(container.querySelector("img")).toHaveAttribute("src", LOGO);
  });

  it("shows the initials when the team has no logo", () => {
    const { container } = renderLogo("Nürnberg Renegades");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".teamlogo")).toHaveTextContent("NR");
  });

  it("shows a placeholder instead of nothing for a bracket placeholder", () => {
    const { container } = renderLogo(null);

    expect(container.querySelector(".teamlogo")).toHaveTextContent("?");
  });

  it("falls back to the initials when the logo file cannot be loaded", () => {
    const { container } = renderLogo("Ravens", new Map([["ravens", LOGO]]));

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".teamlogo")).toHaveTextContent("R");
  });

  it("fails loudly when no provider is mounted", () => {
    // Deleting the provider in App must not silently drop every logo: the
    // missing context is a wiring bug, not "this team has no crest".
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => render(<TeamLogo name="Ravens" />)).toThrow(
      /TeamLogosProvider/,
    );
    consoleError.mockRestore();
  });
});
