import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { LivetickerProvider } from "../context/LivetickerContext";
import type { Game } from "../types";

const game: Game = {
  gameId: 1,
  status: "1. Halbzeit",
  standing: "Gruppe 1",
  stage: "Vorrunde",
  field: 1,
  league: "Testliga",
  gameday: { id: 2, name: "Testtag", address: "Testfeld" },
  time: "2026-08-15T11:30:00+00:00",
  scheduled_at: "2026-08-15T11:30:00+02:00",
  tick_count: 1,
  home: {
    name: "Walldorf Wanderers",
    full_name: "Walldorf Wanderers",
    score: 7,
    isInPossession: true,
    logo: null,
    fh: 7,
    sh: 0,
  },
  away: {
    name: "Düsseldorf Firecats",
    full_name: "Düsseldorf Firecats",
    score: 6,
    isInPossession: false,
    logo: null,
    fh: 6,
    sh: 0,
  },
  ticks: [
    {
      text: "Touchdown: #7 - 45 Yards",
      type: "touchdown",
      team: "home",
      time: "2026-08-15T12:05:00+00:00",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Liveticker v2 App", () => {
  it("renders the context, score, halves and the event list", () => {
    render(
      <LivetickerProvider initialGames={[game]}>
        <App />
      </LivetickerProvider>,
    );

    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getByText(/Testliga/)).toBeInTheDocument();
    expect(screen.getByText(/Testfeld/)).toBeInTheDocument();
    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Düsseldorf Firecats").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getByText("Touchdown")).toBeInTheDocument();
    expect(screen.getByText("45 Yards")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("aria-live", "polite");
  });

  it("shows the empty state when no game is live", () => {
    render(
      <LivetickerProvider initialGames={[]}>
        <App />
      </LivetickerProvider>,
    );
    expect(screen.getByRole("heading", { name: "Kein Spiel läuft" })).toBeInTheDocument();
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
