import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { LivetickerProvider } from "../context/LivetickerContext";
import type { Game } from "../types";
import { game } from "./fixture";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(games: Game[]) {
  render(
    <LivetickerProvider initialGames={games}>
      <App />
    </LivetickerProvider>,
  );
}

describe("Liveticker v2 App", () => {
  it("renders the context, score, halves and the event list", () => {
    renderApp([game]);

    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getByText(/Testliga/)).toBeInTheDocument();
    expect(screen.getByText(/Testfeld/)).toBeInTheDocument();
    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Düsseldorf Firecats").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getByText("Touchdown")).toBeInTheDocument();
    expect(screen.getByText("45 Yards")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Ereignisse" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("shows the empty state when no game is live", () => {
    renderApp([]);
    expect(screen.getByRole("heading", { name: "Nächstes Spiel" })).toBeInTheDocument();
    expect(screen.getByText("Kein Spiel läuft")).toBeInTheDocument();
  });

  it("renders two live games and switches the expanded one", async () => {
    const second: Game = {
      ...game,
      gameId: 2,
      gameday: { id: 3, name: "Zweiter Tag", address: "Feld 2" },
      field: 2,
      home: { ...game.home, name: "Munich Spatzen", score: 13 },
      away: { ...game.away, name: "SG Kelkheim Lizzards", score: 12 },
    };
    renderApp([game, second]);
    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Feld 2/ }));
    expect(screen.getByRole("heading", { name: "Zweiter Tag" })).toBeInTheDocument();
  });

  it("keeps the finished game history and hides possession", () => {
    renderApp([
      {
        ...game,
        status: "beendet",
        home: { ...game.home, isInPossession: true },
      },
    ]);
    expect(screen.getByText("Endstand")).toBeInTheDocument();
    expect(screen.getByText("Touchdown")).toBeInTheDocument();
    expect(screen.queryByText("Ballbesitz")).not.toBeInTheDocument();
  });

  it("marks a scheduled game as late after five minutes", () => {
    renderApp([
      {
        ...game,
        status: "Geplant",
        time: "00:01",
        ticks: [],
      },
    ]);
    expect(screen.getByText("Verspätet")).toBeInTheDocument();
    expect(screen.getByText("verspätet")).toBeInTheDocument();
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
});
