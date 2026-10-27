import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GameLogTeam } from "../api/types";
import { TeamLogosProvider } from "../app/teamLogos";
import ScoreHeader from "./ScoreHeader";

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

  it("keeps the drawn crest with the initial for a team without a logo", () => {
    const { container } = renderHeader(
      team("Ravens"),
      team("Wolves"),
      new Map([["ravens", HOME_LOGO]]),
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
    const crests = container.querySelectorAll(".crest");
    expect(crests).toHaveLength(1);
    expect(crests[0]).toHaveTextContent("W");
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
