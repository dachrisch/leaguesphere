import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import GameList, {
  formatGameScore,
  formatGameTime,
  gameTag,
  type GameListGame,
} from "./GameList";

function makeGame(overrides: Partial<GameListGame> = {}): GameListGame {
  return {
    id: 1,
    scheduled: "13:30:00",
    field: 2,
    officials: "M. Klein",
    officialsId: 4,
    stage: "Vorrunde",
    standing: "",
    home: "Ravens",
    away: "Wolves",
    points_home: null,
    points_away: null,
    status: "Geplant",
    id_home: "11",
    id_away: "12",
    ...overrides,
  };
}

function renderList(
  games: GameListGame[],
  props: { title?: string; subtitle?: string } = {},
) {
  const onSelect = vi.fn();
  const onResume = vi.fn();
  const view = render(
    <GameList
      games={games}
      onSelect={onSelect}
      onResume={onResume}
      {...props}
    />,
  );
  return { onSelect, onResume, ...view };
}

/** The row element (button or div) that holds the given scoreboard pairing. */
function rowFor(pair: string): Element {
  const row = screen.getByText(pair).closest(".game-row");
  if (row === null) {
    throw new Error(`no row around ${pair}`);
  }
  return row;
}

describe("GameList", () => {
  it("shows the gameday name and context in the screen header", () => {
    renderList([makeGame()], {
      title: "Spieltag 4 · RL NRW",
      subtitle: "Sa, 31. Mai · Sportpark am Rhein",
    });

    expect(screen.getByText("Scorecard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Spieltag 4 · RL NRW" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sa, 31. Mai · Sportpark am Rhein"),
    ).toBeInTheDocument();
  });

  it("falls back to a neutral title when no gameday is passed", () => {
    renderList([]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Spiele" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Sa,/)).not.toBeInTheDocument();
  });

  it("renders the scheduled time without seconds", () => {
    renderList([makeGame({ scheduled: "13:30:00" })]);

    const row = screen.getByRole("button", { name: /Ravens – Wolves/ });
    expect(row.querySelector(".game-time")?.textContent).toBe("13:30");
  });

  it.each(["", "keine Zeit", "25:00:00", "13:61:00", "13:30:00:00"])(
    "renders an en dash for the unusable time %j",
    (scheduled) => {
      renderList([makeGame({ scheduled })]);

      const row = screen.getByRole("button", { name: /Ravens – Wolves/ });
      expect(row.querySelector(".game-time")?.textContent).toBe("–");
    },
  );

  it("renders the score as home:away", () => {
    renderList([
      makeGame({ status: "beendet", points_home: 7, points_away: 21 }),
    ]);

    expect(rowFor("Ravens – Wolves").querySelector(".game-score")?.textContent)
      .toBe("7:21");
  });

  it.each([
    [7, null],
    [null, 21],
    [null, null],
  ])("renders an en dash while the score is incomplete (%s:%s)", (home, away) => {
    renderList([makeGame({ points_home: home, points_away: away })]);

    expect(rowFor("Ravens – Wolves").querySelector(".game-score")?.textContent)
      .toBe("–");
  });

  it("renders field, teams, officials and the status tag", () => {
    renderList([makeGame({ points_home: 7, points_away: 21 })]);

    const row = screen.getByRole("button", { name: /Ravens – Wolves/ });
    expect(row).toHaveTextContent("Feld 2");
    expect(row).toHaveTextContent("M. Klein");
    expect(row).toHaveTextContent("offen");
  });

  it.each([
    ["Geplant", "offen"],
    ["", "offen"],
    ["Gestartet", "läuft"],
    ["1. Halbzeit", "läuft"],
    ["2. Halbzeit", "läuft"],
    ["beendet", "beendet"],
  ] as const)("shows the %s status as %s", (status, label) => {
    renderList([makeGame({ status })]);

    expect(rowFor("Ravens – Wolves").querySelector(".tag")?.textContent).toBe(
      label,
    );
  });

  it("summarises the game states above the list", () => {
    const { container } = renderList([
      makeGame({ id: 1, status: "beendet" }),
      makeGame({ id: 2, status: "beendet" }),
      makeGame({ id: 3, status: "1. Halbzeit" }),
      makeGame({ id: 4, status: "Geplant" }),
    ]);

    const cells = Array.from(
      container.querySelectorAll(".sumline > div"),
      (cell) => cell.textContent,
    );
    expect(cells).toEqual(["2 beendet", "1 läuft", "1 offen"]);
  });

  it("marks a passed passcheck with the ok chip", () => {
    renderList([makeGame({ passcheck: true })]);

    expect(screen.getByText("Passcheck")).toHaveClass("chip-ok");
    expect(screen.queryByText("kein Passcheck")).not.toBeInTheDocument();
    expect(rowFor("Ravens – Wolves")).toHaveTextContent(
      "M. Klein · Passcheck",
    );
  });

  it("marks a missing passcheck with the miss chip", () => {
    renderList([makeGame({ passcheck: false })]);

    expect(screen.getByText("kein Passcheck")).toHaveClass("chip-miss");
    expect(screen.queryByText("Passcheck")).not.toBeInTheDocument();
  });

  it("shows no chip while the passcheck field is absent", () => {
    renderList([makeGame()]);

    expect(screen.queryByText("Passcheck")).not.toBeInTheDocument();
    expect(screen.queryByText("kein Passcheck")).not.toBeInTheDocument();
    expect(rowFor("Ravens – Wolves")).toHaveTextContent("M. Klein");
  });

  it("keeps the sub line out when there is neither an official nor a chip", () => {
    renderList([makeGame({ officials: "" })]);

    expect(rowFor("Ravens – Wolves").querySelector(".game-sub")).toBeNull();
  });

  it("renders unresolved bracket teams as dashes", () => {
    renderList([makeGame({ home: null, away: null })]);

    expect(screen.getByText("– – –")).toBeInTheDocument();
  });

  it("offers a planned game as a button that calls onSelect", async () => {
    const game = makeGame({ status: "Geplant" });
    const { onSelect, onResume } = renderList([game]);

    const row = screen.getByRole("button", { name: /Ravens – Wolves/ });
    expect(row).toHaveAttribute("type", "button");

    await userEvent.click(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(game);
    expect(onResume).not.toHaveBeenCalled();
  });

  it("opens a running game through onResume", async () => {
    const game = makeGame({ status: "2. Halbzeit" });
    const { onSelect, onResume } = renderList([game]);

    await userEvent.click(
      screen.getByRole("button", { name: /Ravens – Wolves/ }),
    );

    expect(onResume).toHaveBeenCalledWith(game);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect for a designer row without a status", async () => {
    const game = makeGame({ status: "" });
    const { onSelect } = renderList([game]);

    await userEvent.click(
      screen.getByRole("button", { name: /Ravens – Wolves/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(game);
  });

  it("activates a planned game with Enter", async () => {
    const game = makeGame();
    const { onSelect } = renderList([game]);

    const row = screen.getByRole("button", { name: /Ravens – Wolves/ });
    row.focus();
    expect(row).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(game);
  });

  it("renders a finished game as an inert row", async () => {
    const game = makeGame({
      status: "beendet",
      points_home: 7,
      points_away: 21,
    });
    const { onSelect, onResume } = renderList([game]);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    const row = rowFor("Ravens – Wolves");
    expect(row.tagName).toBe("DIV");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");

    await userEvent.click(screen.getByText("Ravens – Wolves"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("names each actionable row by both teams and the score", () => {
    renderList([makeGame({ points_home: 7, points_away: 21 })]);

    expect(
      screen.getByRole("button", { name: /Ravens – Wolves.*7:21/ }),
    ).toBeInTheDocument();
  });

  it("renders an empty state when the gameday has no games", () => {
    const { container } = renderList([]);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Keine Spiele für diesen Spieltag");
    expect(status).toHaveTextContent(
      "Sobald der Spielplan veröffentlicht ist, erscheinen hier die Spiele.",
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Keine Spiele für diesen Spieltag",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".sumline")).toBeNull();
  });
});

describe("gameTag", () => {
  it.each([
    ["Geplant", "open", "offen", "select"],
    ["", "open", "offen", "select"],
    ["Gestartet", "live", "läuft", "resume"],
    ["1. Halbzeit", "live", "läuft", "resume"],
    ["2. Halbzeit", "live", "läuft", "resume"],
    ["beendet", "done", "beendet", "none"],
  ] as const)(
    "maps %j to %s / %s / %s",
    (status, variant, label, action) => {
      expect(gameTag(status)).toEqual({ variant, label, action });
    },
  );
});

describe("formatGameTime", () => {
  it("pins the payload format: HH:MM:SS becomes HH:MM", () => {
    expect(formatGameTime("13:30:00")).toBe("13:30");
    expect(formatGameTime("09:05:00")).toBe("09:05");
    expect(formatGameTime("00:00:00")).toBe("00:00");
  });

  it("accepts an already trimmed value", () => {
    expect(formatGameTime("13:30")).toBe("13:30");
    expect(formatGameTime("9:05")).toBe("09:05");
  });

  it("returns an en dash for empty, malformed and impossible values", () => {
    expect(formatGameTime("")).toBe("–");
    expect(formatGameTime(null)).toBe("–");
    expect(formatGameTime("26.10.2026")).toBe("–");
    expect(formatGameTime("24:00:00")).toBe("–");
    expect(formatGameTime("13:60:00")).toBe("–");
  });
});

describe("formatGameScore", () => {
  it("joins both sides with a colon", () => {
    expect(formatGameScore(7, 21)).toBe("7:21");
    expect(formatGameScore(0, 0)).toBe("0:0");
  });

  it("returns an en dash when either side is missing", () => {
    expect(formatGameScore(null, 21)).toBe("–");
    expect(formatGameScore(7, null)).toBe("–");
    expect(formatGameScore(null, null)).toBe("–");
  });
});
