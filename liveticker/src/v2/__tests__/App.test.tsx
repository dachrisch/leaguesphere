import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { LivetickerProvider } from "../context/LivetickerContext";
import type { Game } from "../types";
import { game } from "./fixture";

const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const liveGame: Game = { ...game, gameId: 1 };

const upcomingGame: Game = {
  ...game,
  gameId: 2,
  status: "Geplant",
  scheduled_at: minutesFromNow(90),
  time: "13:00",
  tick_count: 0,
  ticks: [],
  home: {
    ...game.home,
    name: "Next Home",
    score: null,
    fh: null,
    sh: null,
    isInPossession: false,
  },
  away: {
    ...game.away,
    name: "Next Away",
    score: null,
    fh: null,
    sh: null,
    isInPossession: false,
  },
};

const finishedGame: Game = {
  ...game,
  gameId: 3,
  status: "beendet",
  scheduled_at: minutesFromNow(-180),
  tick_count: 2,
  home: { ...game.home, name: "Old Home", score: 21, fh: 14, sh: 7 },
  away: { ...game.away, name: "Old Away", score: 14, fh: 7, sh: 7 },
};

const secondFinished: Game = {
  ...finishedGame,
  gameId: 4,
  scheduled_at: minutesFromNow(-300),
  home: { ...finishedGame.home, name: "Older Home", score: 7 },
  away: { ...finishedGame.away, name: "Older Away", score: 6 },
};

beforeEach(() => {
  window.history.replaceState({}, "", "/liveticker/v2/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const GAMEDAY_PATH = "/liveticker/v2/gameday/2/";
const gamePath = (id: number) => `/liveticker/v2/gameday/2/game/${id}/`;

function renderApp(games: Game[], path = GAMEDAY_PATH) {
  window.history.replaceState({}, "", path);
  render(
    <LivetickerProvider initialGames={games}>
      <App />
    </LivetickerProvider>,
  );
}

function headingTexts(): string[] {
  return screen.getAllByRole("heading").map((heading) => heading.textContent ?? "");
}

function resultRows(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".lt-result-row"));
}

describe("Liveticker v2 App", () => {
  it("renders the live chips, upcoming and results in that order", () => {
    renderApp([liveGame, upcomingGame, finishedGame]);

    const headings = headingTexts();
    expect(headings).toContain("Als Nächstes");
    expect(headings).toContain("Ergebnisse");
    expect(headings.indexOf("Als Nächstes")).toBeLessThan(
      headings.indexOf("Ergebnisse"),
    );
    const chips = document.querySelector(".lt-live-strip");
    const next = screen.getByText("Als Nächstes");
    expect(chips).not.toBeNull();
    expect(
      (chips as Element).compareDocumentPosition(next) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText(/Next Home/)).toBeInTheDocument();
    expect(resultRows()).toHaveLength(1);
  });

  it("renders the countdown lead and the results between rounds", () => {
    renderApp([finishedGame, upcomingGame]);

    const headings = headingTexts();
    expect(headings).not.toContain("Live");
    expect(screen.getByRole("heading", { name: "Nächstes Spiel" })).toBeInTheDocument();
    expect(screen.getByText("Kein Spiel läuft")).toBeInTheDocument();
    expect(screen.getByText(/in \d+ Min/)).toBeInTheDocument();
    expect(headings.indexOf("Als Nächstes")).toBeLessThan(
      headings.indexOf("Ergebnisse"),
    );
    expect(resultRows()).toHaveLength(1);
  });

  it("switches between two live games and updates the URL", async () => {
    const second: Game = {
      ...liveGame,
      gameId: 2,
      field: 2,
      home: { ...liveGame.home, name: "Munich Spatzen", score: 13 },
      away: { ...liveGame.away, name: "SG Kelkheim Lizzards", score: 12 },
    };
    renderApp([liveGame, second]);

    expect(
      screen.getByRole("heading", {
        name: "Walldorf Wanderers – Düsseldorf Firecats",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /F2/ }));

    expect(
      screen.getByRole("heading", {
        name: "Munich Spatzen – SG Kelkheim Lizzards",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe(gamePath(2));
  });

  it("marks a delayed upcoming game as verspätet", () => {
    const late: Game = {
      ...upcomingGame,
      gameId: 5,
      scheduled_at: minutesFromNow(-10),
    };
    renderApp([late]);

    expect(screen.getByText("verspätet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nächstes Spiel" })).toBeInTheDocument();
  });

  it("shows every finished game newest first", () => {
    renderApp([secondFinished, finishedGame]);

    const rows = resultRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Old Home");
    expect(rows[0].textContent).toContain("Endstand");
    expect(rows[0].textContent).toContain("1. HZ 14:7 · 2. HZ 7:7");
    expect(rows[1].textContent).toContain("Older Home");
  });

  it("shows the empty state when nothing is scheduled yet", () => {
    renderApp([]);

    expect(screen.getByRole("heading", { name: "Nächstes Spiel" })).toBeInTheDocument();
    expect(screen.getByText("Kein Spiel läuft")).toBeInTheDocument();
    expect(screen.queryByText("Ergebnisse")).not.toBeInTheDocument();
  });

  it("groups several gamedays with their own league header", () => {
    const otherDay = { id: 9, name: "Zweiter Tag", address: "Feld 2" };
    renderApp([
      liveGame,
      { ...finishedGame, gameday: otherDay, league: "Andere Liga" },
    ]);

    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Zweiter Tag" })).toBeInTheDocument();
    expect(screen.getAllByText("Testliga").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Andere Liga").length).toBeGreaterThan(0);
    expect(resultRows()).toHaveLength(1);
  });

  it("renders the context, score, halves and the event list", () => {
    renderApp([liveGame]);

    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getAllByText(/Testliga/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Testfeld/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Düsseldorf Firecats").length).toBeGreaterThan(0);
    expect(screen.getByText("Touchdown")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Ereignisse" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("expands the full history through the all-events control", async () => {
    renderApp([{ ...liveGame, tick_count: 9 }]);

    const button = screen.getByRole("button", { name: "Alle 9 Ereignisse" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);

    expect(screen.getByRole("button", { name: "Weniger anzeigen" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // "Alle Ereignisse" is UI state: the address stays the game path the
    // page auto-selected.
    expect(window.location.pathname).toBe(gamePath(1));
    expect(window.location.search).toBe("");
  });

  it("opens the full history from an expanded result", async () => {
    renderApp([{ ...finishedGame, tick_count: 9 }], gamePath(3));

    await userEvent.click(
      screen.getByRole("button", { name: "Alle 9 Ereignisse" }),
    );

    expect(screen.getByRole("button", { name: "Weniger anzeigen" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(window.location.pathname).toBe(gamePath(3));
    expect(window.location.search).toBe("");
  });

  it("expands and focuses the game from a deep link", () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    renderApp([finishedGame], gamePath(3));

    const heading = screen.getByRole("heading", {
      name: "Old Home – Old Away",
    });
    expect(resultRows()[0]).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalled();
    Element.prototype.scrollIntoView = original;
  });

  it("focuses a deep link when scrolling is unavailable", () => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView =
      undefined as unknown as typeof Element.prototype.scrollIntoView;
    renderApp([finishedGame], gamePath(3));

    expect(
      document.activeElement,
    ).toBe(screen.getByRole("heading", { name: "Old Home – Old Away" }));
    Element.prototype.scrollIntoView = original;
  });

  it("collapses the expanded result when its row is clicked again", async () => {
    renderApp([finishedGame], gamePath(3));

    await userEvent.click(resultRows()[0]);

    expect(window.location.pathname).toBe(GAMEDAY_PATH);
    expect(
      screen.queryByRole("heading", { name: "Old Home – Old Away" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the full team name in the result and the deep link", () => {
    const anonymous: Game = {
      ...finishedGame,
      gameId: 7,
      league: "",
      gameday: { id: 2, name: "", address: "" },
      home: { ...finishedGame.home, name: "", full_name: "Full Home" },
      away: { ...finishedGame.away, name: "", full_name: "Full Away" },
    };
    renderApp([anonymous], gamePath(7));

    expect(screen.getAllByText("Full Home").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Full Away").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "Full Home – Full Away" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Liveticker" }).length).toBe(2);
  });

  it("renders half scores with dashes and omits an empty halftime line", () => {
    const first: Game = {
      ...finishedGame,
      gameId: 8,
      home: { ...finishedGame.home, fh: 7, sh: null },
      away: { ...finishedGame.away, fh: null, sh: 6 },
    };
    const second: Game = {
      ...finishedGame,
      gameId: 9,
      scheduled_at: minutesFromNow(-400),
      home: { ...finishedGame.home, fh: null, sh: 7 },
      away: { ...finishedGame.away, fh: 6, sh: null },
    };
    const noHalves: Game = {
      ...finishedGame,
      gameId: 10,
      scheduled_at: minutesFromNow(-500),
      home: { ...finishedGame.home, fh: null, sh: null, score: null },
      away: { ...finishedGame.away, fh: null, sh: null, score: null },
    };
    renderApp([noHalves, second, first]);

    const rows = resultRows();
    expect(rows[0].textContent).toContain("1. HZ 7:– · 2. HZ –:6");
    expect(rows[1].textContent).toContain("1. HZ –:6 · 2. HZ 7:–");
    expect(rows[2].textContent).not.toContain("1. HZ");
    expect(rows[2].textContent).toContain("0 : 0");
  });

  it("marks delayed upcoming rows while live", () => {
    const late: Game = {
      ...upcomingGame,
      gameId: 5,
      scheduled_at: minutesFromNow(-10),
    };
    const later: Game = {
      ...upcomingGame,
      gameId: 6,
      scheduled_at: minutesFromNow(120),
    };
    renderApp([liveGame, late, later]);

    const delayed = document.querySelector(".lt-upcoming-delayed");
    expect(delayed).not.toBeNull();
    expect(delayed?.textContent).toContain("verspätet");
    expect(document.querySelectorAll(".lt-upcoming-row")).toHaveLength(2);
  });

  it("restores the expanded game through popstate", async () => {
    renderApp([finishedGame, secondFinished], gamePath(3));
    expect(resultRows()[0]).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(resultRows()[1]);
    expect(window.location.pathname).toBe(gamePath(4));
    expect(resultRows()[1]).toHaveAttribute("aria-expanded", "true");

    act(() => {
      window.history.pushState({}, "", gamePath(3));
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(resultRows()[0]).toHaveAttribute("aria-expanded", "true");
    expect(resultRows()[1]).toHaveAttribute("aria-expanded", "false");
  });

  it("falls back to the overview when the linked game is gone", () => {
    renderApp([finishedGame], gamePath(99));

    expect(screen.getByText("Spiel nicht mehr im Ticker")).toBeInTheDocument();
    expect(screen.getByText("Ergebnisse")).toBeInTheDocument();
    expect(resultRows()).toHaveLength(1);
  });

  it("shares the deep link of the selected game", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    renderApp([finishedGame], gamePath(3));

    await userEvent.click(screen.getByRole("button", { name: "Ticker teilen" }));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0] as unknown as {
      title: string;
      url: string;
    }[];
    expect(payload[0].title).toBe("Old Home – Old Away · Liveticker");
    const shared = new URL(payload[0].url);
    expect(shared.pathname).toBe(gamePath(3));
    expect(shared.search).toBe("");
  });

  it("shows a compact gameday bar with live count and share", () => {
    renderApp([liveGame, upcomingGame, finishedGame]);

    const topbar = document.querySelector(".lt-topbar");
    expect(topbar).not.toBeNull();
    expect(topbar?.textContent).toContain("Testliga");
    expect(topbar?.textContent).toContain("Testtag");
    expect(topbar?.textContent).toContain("1 LIVE");
    expect(
      topbar?.querySelector("button[aria-label='Ticker teilen']"),
    ).not.toBeNull();
  });

  it("keeps the league in the header for narrow screens", () => {
    renderApp([liveGame, upcomingGame, finishedGame]);

    const league = document.querySelector(".lt-topbar-league");
    expect(league).not.toBeNull();
    expect(league).toHaveTextContent("Testliga");
    expect(document.querySelectorAll(".lt-live-count")).toHaveLength(1);
  });

  it("renders short team names in the live chips", () => {
    renderApp([liveGame]);

    const chip = document.querySelector(".lt-live-tab");
    expect(chip?.textContent).toContain("F1");
    expect(chip?.textContent).toContain("Wanderers");
    expect(chip?.textContent).toContain("7:6");
    expect(chip?.textContent).toContain("Firecats");
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
  });

  it("fills the gameday card with date, address and counts", () => {
    renderApp([liveGame, upcomingGame, finishedGame]);

    const card = document.querySelector(".lt-gameday-card");
    expect(card?.textContent).toContain("Testtag");
    expect(card?.textContent).toContain("Testfeld");
    expect(card?.textContent).toContain("Spiele");
    expect(card?.textContent).toContain("3");
    expect(card?.textContent).toContain("1");
  });

  it("labels results as Endstand and bolds the winner", () => {
    renderApp([finishedGame]);

    const row = resultRows()[0];
    expect(row.textContent).toContain("Endstand");
    expect(row.textContent).toContain("1. HZ 14:7 · 2. HZ 7:7");
    expect(row.querySelector(".lt-result-home")).toHaveClass("lt-winner");
    expect(row.querySelector(".lt-result-away")).not.toHaveClass("lt-winner");
  });

  it("bolds an away win as well", () => {
    renderApp([
      {
        ...finishedGame,
        gameId: 11,
        home: { ...finishedGame.home, score: 7 },
        away: { ...finishedGame.away, score: 14 },
      },
    ]);

    const row = resultRows()[0];
    expect(row.querySelector(".lt-result-away")).toHaveClass("lt-winner");
    expect(row.querySelector(".lt-result-home")).not.toHaveClass("lt-winner");
  });

  it("keeps the share action in the gameday bar", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    renderApp([finishedGame], gamePath(3));

    const button = screen.getByRole("button", { name: "Ticker teilen" });
    expect(button.closest(".lt-topbar")).not.toBeNull();
    await userEvent.click(button);

    expect(share).toHaveBeenCalledTimes(1);
  });

  it("shows the loading state", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(
      <LivetickerProvider>
        <App />
      </LivetickerProvider>,
    );
    expect(screen.getByText("Lade Liveticker …")).toBeInTheDocument();
  });

  it("shows the request error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    render(
      <LivetickerProvider>
        <App />
      </LivetickerProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText("Der Liveticker konnte nicht geladen werden."),
      ).toBeInTheDocument(),
    );
  });

  it("writes the auto-selected game with replaceState, not pushState", async () => {
    window.history.replaceState({}, "", GAMEDAY_PATH);
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");

    render(
      <LivetickerProvider initialGames={[liveGame]}>
        <App />
      </LivetickerProvider>,
    );

    await waitFor(() => expect(window.location.pathname).toBe(gamePath(1)));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("auto-selects the newest result once the day is over", async () => {
    renderApp([finishedGame, secondFinished]);

    await waitFor(() => expect(window.location.pathname).toBe(gamePath(3)));
    expect(
      screen.getByRole("heading", { name: "Old Home – Old Away" }),
    ).toBeInTheDocument();
  });

  it("does not overwrite a user's selection with the auto-selected game", async () => {
    const secondLive: Game = {
      ...liveGame,
      gameId: 2,
      field: 2,
      home: { ...liveGame.home, name: "Munich Spatzen" },
      away: { ...liveGame.away, name: "SG Kelkheim Lizzards" },
    };
    renderApp([liveGame, secondLive]);
    await waitFor(() => expect(window.location.pathname).toBe(gamePath(1)));

    await userEvent.click(screen.getByRole("button", { name: /F2/ }));
    expect(window.location.pathname).toBe(gamePath(2));

    await act(async () => {});
    expect(window.location.pathname).toBe(gamePath(2));
  });

  it("leaves the bare root alone when several gamedays are on screen", async () => {
    const otherDay: Game = {
      ...liveGame,
      gameId: 9,
      gameday: { id: 9, name: "Zweiter Tag", address: "" },
    };
    renderApp([liveGame, otherDay], "/liveticker/v2/");

    await act(async () => {});

    expect(window.location.pathname).toBe("/liveticker/v2/");
  });
});
