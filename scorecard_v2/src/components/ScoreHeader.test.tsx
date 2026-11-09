import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GameLogTeam } from "../api/types";
import { TeamLogosProvider } from "../app/teamLogos";
import ScoreHeader, { timeoutDots } from "./ScoreHeader";

const HOME_LOGO = "https://example.test/media/teammanager/logos/ravens.png";
const AWAY_LOGO = "https://example.test/media/teammanager/logos/wolves.png";

function team(name: string | null, score = 0): GameLogTeam {
  return {
    id: 1,
    name,
    score,
    firsthalf: { score, entries: [] },
    secondhalf: { score: 0, entries: [] },
  };
}

function renderHeader(
  home: GameLogTeam,
  away: GameLogTeam,
  logos: Map<string, string> = new Map(),
) {
  return render(
    <TeamLogosProvider logos={logos}>
      <ScoreHeader
        away={away}
        disabled={false}
        home={home}
        isFirstHalf
        onPossession={vi.fn()}
        possession={null}
      />
    </TeamLogosProvider>,
  );
}

describe("ScoreHeader — team logos", () => {
  it("shows a logo for each side that has one", () => {
    const { container } = renderHeader(
      team("Ravens"),
      team("Wolves"),
      new Map([
        ["ravens", HOME_LOGO],
        ["wolves", AWAY_LOGO],
      ]),
    );

    const images = Array.from(container.querySelectorAll("img"));
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      HOME_LOGO,
      AWAY_LOGO,
    ]);
    expect(images.every((image) => image.getAttribute("alt") === "")).toBe(true);
  });

  it("keeps the drawn crest with the initials of the team name", () => {
    const { container } = renderHeader(
      team("Nürnberg Renegades"),
      team("Wolves"),
      new Map(),
    );

    const crests = Array.from(
      container.querySelectorAll("span.teamlogo-crest"),
    );
    // One initials rule everywhere: two words carry two letters.
    expect(crests.map((crest) => crest.textContent)).toEqual(["NR", "W"]);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("uses one crest box for the logo and for the initials", () => {
    const withLogo = renderHeader(
      team("Ravens"),
      team("Wolves"),
      new Map([["ravens", HOME_LOGO]]),
    );
    const image = withLogo.container.querySelector("img");
    expect(image).toHaveClass("teamlogo", "teamlogo-crest");
    withLogo.unmount();

    const withInitials = renderHeader(team("Ravens"), team("Wolves"), new Map());
    const shield = withInitials.container.querySelector(".teamlogo-crest");
    expect(shield?.tagName).toBe("SPAN");
    // Same footprint: the size class is shared, only the content differs.
    expect(shield).toHaveClass("teamlogo", "teamlogo-crest");
  });

  it("still renders both names and the score", () => {
    renderHeader(team("Ravens", 7), team("Wolves", 3), new Map());

    expect(
      screen.getByRole("button", { name: /Ravens, 7 Punkte/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Wolves, 3 Punkte/ }),
    ).toBeInTheDocument();
  });
});

describe("ScoreHeader — timeouts", () => {
  function renderTimeouts(
    homeUsed: number,
    awayUsed: number,
    { disabled = false, onTimeout = vi.fn() }: {
      disabled?: boolean;
      onTimeout?: (team: string) => void;
    } = {},
  ) {
    return render(
      <TeamLogosProvider logos={new Map()}>
        <ScoreHeader
          away={team("Wolves")}
          disabled={false}
          home={team("Ravens")}
          isFirstHalf
          onTimeout={onTimeout}
          possession="Ravens"
          timeouts={(entry) => ({
            used: entry.name === "Ravens" ? homeUsed : awayUsed,
            perHalf: 2,
          })}
          timeoutDisabled={disabled}
        />
      </TeamLogosProvider>,
    );
  }

  it("draws filled circles for the timeouts still available", () => {
    expect(timeoutDots({ used: 0, perHalf: 2 })).toBe("●●");
    expect(timeoutDots({ used: 1, perHalf: 2 })).toBe("●○");
    expect(timeoutDots({ used: 2, perHalf: 2 })).toBe("○○");
    expect(timeoutDots({ used: 3, perHalf: 2 })).toBe("○○");
  });

  it("shows each side's budget and marks the exhausted one", () => {
    renderTimeouts(1, 2);

    expect(screen.getByRole("button", { name: "Auszeit Ravens" })).toHaveTextContent(
      "●○",
    );
    const away = screen.getByRole("button", { name: "Auszeit Wolves" });
    expect(away).toHaveTextContent("○○");
    expect(away).toHaveClass("is-used");
  });

  it("takes a timeout for the tapped side", async () => {
    const onTimeout = vi.fn();
    renderTimeouts(0, 0, { onTimeout });

    screen.getByRole("button", { name: "Auszeit Ravens" }).click();

    expect(onTimeout).toHaveBeenCalledWith("Ravens");
  });

  it("disables the circles while a write is in flight", () => {
    renderTimeouts(0, 0, { disabled: true });

    expect(screen.getByRole("button", { name: "Auszeit Ravens" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Auszeit Wolves" })).toBeDisabled();
  });
});
