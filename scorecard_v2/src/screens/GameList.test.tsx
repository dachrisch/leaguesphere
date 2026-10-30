import {
  render as renderComponent,
  screen,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Game } from "../api/types";
import { TeamLogosProvider } from "../app/teamLogos";
import { gameTag } from "../components/tag";
import GameList, { formatGameScore, formatGameTime } from "./GameList";

/**
 * `Gameinfo.status` is free text on the wire, so the fixture builder accepts
 * any string (legacy capitalisation, unknown state) and narrows to the type.
 */
type GameOverrides = Omit<Partial<Game>, "status"> & { status?: string };

function makeGame(overrides: GameOverrides = {}): Game {
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
  } as Game;
}

function renderList(
  games: Game[],
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

/** The rows read the team directory from the provider; none here by default. */
function render(ui: ReactElement) {
  return renderComponent(
    <TeamLogosProvider logos={new Map()}>{ui}</TeamLogosProvider>,
  );
}

describe("GameList", () => {
  it("shows the gameday name and context in the screen header", () => {
    renderList([makeGame()], {
      title: "Spieltag 4 · RL NRW",
      subtitle: "Sa, 31. Mai · Sportpark am Rhein",
    });

    expect(screen.queryByText("Scorecard")).toBeNull();
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

    const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
    expect(row.querySelector(".game-time")?.textContent).toBe("13:30");
  });

  it.each(["", "keine Zeit", "25:00:00", "13:61:00", "13:30:00:00"])(
    "renders an en dash for the unusable time %j",
    (scheduled) => {
      renderList([makeGame({ scheduled })]);

      const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
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

  it("renders a 0:0 result instead of treating it as missing", () => {
    renderList([
      makeGame({ status: "beendet", points_home: 0, points_away: 0 }),
    ]);

    expect(rowFor("Ravens – Wolves").querySelector(".game-score")?.textContent)
      .toBe("0:0");
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

    const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
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

  it("drops the counter tiles: the scope control carries the count", () => {
    const { container } = renderList([
      makeGame({ id: 1, status: "beendet" }),
      makeGame({ id: 2, status: "Geplant" }),
    ]);

    expect(container.querySelector(".sumline")).toBeNull();
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

  it("shows the chip without a dangling separator when no official is set", () => {
    renderList([makeGame({ officials: "", passcheck: true })]);

    const sub = rowFor("Ravens – Wolves").querySelector(".game-sub");
    expect(sub?.textContent).toBe("Passcheck");
    expect(screen.getByText("Passcheck")).toHaveClass("chip-ok");
  });

  it("renders unresolved bracket teams as dashes", () => {
    renderList([makeGame({ home: null, away: null })]);

    expect(screen.getByText("– – –")).toBeInTheDocument();
  });

  it("offers a planned game as a button that calls onSelect", async () => {
    const game = makeGame({ status: "Geplant" });
    const { onSelect, onResume } = renderList([game]);

    const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
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
      screen.getByRole("button", { name: /Ravens gegen Wolves/ }),
    );

    expect(onResume).toHaveBeenCalledWith(game);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect for a designer row without a status", async () => {
    const game = makeGame({ status: "" });
    const { onSelect } = renderList([game]);

    await userEvent.click(
      screen.getByRole("button", { name: /Ravens gegen Wolves/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(game);
  });

  it("activates a planned game with Enter", async () => {
    const game = makeGame();
    const { onSelect } = renderList([game]);

    const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
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

    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("link")).not.toBeInTheDocument();

    const row = rowFor("Ravens – Wolves");
    expect(row.tagName).toBe("DIV");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");

    await userEvent.click(screen.getByText("Ravens – Wolves"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("gives each actionable row an explicit accessible name", () => {
    renderList([makeGame({ points_home: 7, points_away: 21 })]);

    expect(within(screen.getByRole("main")).getByRole("button")).toHaveAccessibleName(
      "13:30, Feld 2, Ravens gegen Wolves, 7:21, offen",
    );
  });

  it("names a missing score with an en dash", () => {
    renderList([makeGame({ points_home: null, points_away: null })]);

    expect(within(screen.getByRole("main")).getByRole("button")).toHaveAccessibleName(
      "13:30, Feld 2, Ravens gegen Wolves, –, offen",
    );
  });

  it("includes a checked passcheck in the accessible row name", () => {
    renderList([
      makeGame({ points_home: 7, points_away: 21, passcheck: true }),
    ]);

    expect(within(screen.getByRole("main")).getByRole("button")).toHaveAccessibleName(
      "13:30, Feld 2, Ravens gegen Wolves, 7:21, offen, Passcheck geprüft",
    );
  });

  it("includes a missing passcheck in the accessible row name", () => {
    renderList([
      makeGame({ points_home: 7, points_away: 21, passcheck: false }),
    ]);

    expect(within(screen.getByRole("main")).getByRole("button")).toHaveAccessibleName(
      "13:30, Feld 2, Ravens gegen Wolves, 7:21, offen, kein Passcheck",
    );
  });

  it("keeps the accessible name in the running vocabulary", () => {
    renderList([
      makeGame({
        status: "1. Halbzeit",
        points_home: 20,
        points_away: 7,
      }),
    ]);

    expect(within(screen.getByRole("main")).getByRole("button")).toHaveAccessibleName(
      "13:30, Feld 2, Ravens gegen Wolves, 20:7, läuft",
    );
  });

  it("treats a legacy capitalised Beendet as finished", () => {
    renderList([
      makeGame({ status: "Beendet", points_home: 7, points_away: 21 }),
    ]);

    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();
    expect(rowFor("Ravens – Wolves").querySelector(".tag")?.textContent).toBe(
      "beendet",
    );
  });

  it("keeps an unknown status open and tappable", async () => {
    const game = makeGame({ status: "Abgesagt" });
    const { onSelect } = renderList([game]);

    const row = screen.getByRole("button", { name: /Ravens gegen Wolves/ });
    expect(row.querySelector(".tag")?.textContent).toBe("offen");

    await userEvent.click(row);

    expect(onSelect).toHaveBeenCalledWith(game);
  });

  it("dispatches a mixed list to exactly one select and one resume", async () => {
    const finished = makeGame({
      id: 1,
      status: "beendet",
      points_home: 7,
      points_away: 21,
    });
    const planned = makeGame({ id: 2, home: "Hawks", away: "Ravens" });
    const running = makeGame({
      id: 3,
      status: "1. Halbzeit",
      home: "Eagles",
      away: "Coyotes",
    });
    const { onSelect, onResume } = renderList([finished, planned, running]);

    // Two rows plus the "Als Nächstes" shortcut to the running game.
    expect(within(screen.getByRole("main")).getAllByRole("button")).toHaveLength(3);

    await userEvent.click(
      screen.getByRole("button", { name: /Hawks gegen Ravens/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Eagles gegen Coyotes/ }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(planned);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(running);
    expect(rowFor("Ravens – Wolves").tagName).toBe("DIV");
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
    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".sumline")).toBeNull();
  });
});

describe("GameList — team logos", () => {
  const HOME_LOGO = "https://example.test/media/teammanager/logos/ravens.png";
  const AWAY_LOGO = "https://example.test/media/teammanager/logos/wolves.png";

  function renderWithLogos(logos: Map<string, string>, games: Game[]) {
    return renderComponent(
      <TeamLogosProvider logos={logos}>
        <GameList games={games} onResume={vi.fn()} onSelect={vi.fn()} />
      </TeamLogosProvider>,
    );
  }

  it("puts each team's logo beside the pairing", () => {
    renderWithLogos(
      new Map([
        ["ravens", HOME_LOGO],
        ["wolves", AWAY_LOGO],
      ]),
      [makeGame()],
    );

    const row = rowFor("Ravens – Wolves");
    const images = Array.from(row.querySelectorAll("img"));
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      HOME_LOGO,
      AWAY_LOGO,
    ]);
    expect(images.every((image) => image.getAttribute("alt") === "")).toBe(true);
  });

  it("keeps the initials for a team without a logo", () => {
    renderWithLogos(new Map([["ravens", HOME_LOGO]]), [makeGame()]);

    const row = rowFor("Ravens – Wolves");
    expect(row.querySelectorAll("img")).toHaveLength(1);
    const initial = Array.from(row.querySelectorAll(".teamlogo")).find(
      (element) => element.tagName !== "IMG",
    );
    expect(initial).toHaveTextContent("W");
  });

  it("shows the initials when no logos are known at all", () => {
    renderWithLogos(new Map(), [makeGame()]);

    const row = rowFor("Ravens – Wolves");
    expect(row.querySelectorAll("img")).toHaveLength(0);
    expect(row).toHaveTextContent("Ravens – Wolves");
  });
});

describe("gameTag", () => {
  it.each([
    ["Geplant", "open", "offen", "select"],
    ["", "open", "offen", "select"],
    ["Abgesagt", "open", "offen", "select"],
    ["Gestartet", "live", "läuft", "resume"],
    ["1. Halbzeit", "live", "läuft", "resume"],
    ["2. Halbzeit", "live", "läuft", "resume"],
    ["beendet", "done", "beendet", "none"],
    ["Beendet", "done", "beendet", "none"],
    [" BEENDET ", "done", "beendet", "none"],
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
    expect(formatGameTime("9:05:00")).toBe("09:05");
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

describe("GameList — scope", () => {
  function renderScope(props: {
    allGames?: boolean;
    fallback?: boolean;
    games?: Game[];
  }) {
    const onToggleAll = vi.fn();
    render(
      <GameList
        allGames={props.allGames ?? false}
        fallback={props.fallback ?? false}
        games={props.games ?? [makeGame()]}
        onResume={vi.fn()}
        onSelect={vi.fn()}
        onToggleAll={onToggleAll}
      />,
    );
    return { onToggleAll };
  }

  it("is a two-way control that names both scopes", async () => {
    const { onToggleAll } = renderScope({ allGames: false });

    const scope = screen.getByRole("group", { name: "Spiele anzeigen" });
    const mine = within(scope).getByRole("button", { name: /^Meine/ });
    const all = within(scope).getByRole("button", { name: /^Alle/ });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(mine);
    expect(onToggleAll).not.toHaveBeenCalled();
    await userEvent.click(all);
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("counts the games of the shown scope", () => {
    renderScope({
      allGames: true,
      games: [makeGame({ id: 1 }), makeGame({ id: 2 }), makeGame({ id: 3 })],
    });

    expect(screen.getByRole("button", { name: /^Alle/ })).toHaveTextContent(
      "Alle (3)",
    );
  });

  it("says why it shows the whole gameday when nothing is assigned", () => {
    renderScope({ allGames: true, fallback: true });

    const mine = screen.getByRole("button", { name: /^Meine/ });
    expect(mine).toHaveTextContent("Meine (0)");
    expect(mine).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Alle/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText("Dir ist kein Spiel zugeteilt – du siehst den ganzen Spieltag."),
    ).toBeInTheDocument();
  });
});

describe("GameList — next game", () => {
  it("puts the running game first as the shortcut", async () => {
    const planned = makeGame({ id: 1, home: "Hawks", away: "Ravens" });
    const running = makeGame({
      id: 2,
      status: "1. Halbzeit",
      home: "Eagles",
      away: "Coyotes",
    });
    const { onResume } = renderList([planned, running]);

    const next = screen.getByRole("region", { name: "Als Nächstes" });
    expect(next).toHaveTextContent("Eagles");
    expect(next).toHaveTextContent("Coyotes");
    await userEvent.click(within(next).getByRole("button", { name: "Weiter erfassen" }));
    expect(onResume).toHaveBeenCalledWith(running);
  });

  it("otherwise offers the first open game to prepare", async () => {
    const first = makeGame({ id: 1, home: "Hawks", away: "Ravens", scheduled: "10:00:00" });
    const second = makeGame({ id: 2, home: "Eagles", away: "Coyotes", scheduled: "11:10:00" });
    const { onSelect } = renderList([first, second]);

    const next = screen.getByRole("region", { name: "Als Nächstes" });
    expect(next).toHaveTextContent("10:00");
    await userEvent.click(within(next).getByRole("button", { name: "Spiel vorbereiten" }));
    expect(onSelect).toHaveBeenCalledWith(first);
  });

  it("shows no shortcut for a single game or a finished gameday", () => {
    renderList([makeGame()]);
    expect(screen.queryByRole("region", { name: "Als Nächstes" })).toBeNull();
  });
});
