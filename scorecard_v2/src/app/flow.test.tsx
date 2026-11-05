// The whole flow against a mocked API: gameday → game → preparation →
// tracking → finalise → result, including the request order.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import App from "../App";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { ApiError } from "../api/client";
import type { Gameday, Game, GameLog, GameLogTeam } from "../api/types";
import { resetSnapshotStore, readSnapshot, snapshotKey } from "../offline/snapshot";
import { resetRuntime } from "../session/runtime";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
  };
});

const apiGetMock = apiGet as unknown as Mock;
const apiPostMock = apiPost as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;
const apiDeleteMock = apiDelete as unknown as Mock;

const GAMEDAY: Gameday = {
  id: 1,
  name: "Herbsttag",
  season: 1,
  league: 2,
  league_display: "Landesliga",
  date: "2026-10-26",
  start: "10:00",
  format: "6_2",
  author: 1,
  address: "Sportplatz Nord",
  status: "PUBLISHED",
  published_at: null,
  updated_at: "2026-10-26T08:00:00Z",
  resource_urls: [],
};

const GAME: Game = {
  id: 42,
  scheduled: "13:30:00",
  field: 2,
  officials: "Crew Rhein",
  officialsId: 7,
  stage: "Vorrunde",
  standing: "",
  home: "Ravens",
  away: "Wolves",
  points_home: null,
  points_away: null,
  status: "Geplant",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

function team(overrides: Partial<GameLogTeam> = {}): GameLogTeam {
  return {
    id: 1,
    name: "Ravens",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
    ...overrides,
  };
}

function log(overrides: Partial<GameLog> = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(),
    away: team({ id: 2, name: "Wolves" }),
    ...overrides,
  };
}

/** Every request in the order it left the app. */
let calls: string[] = [];

function routeGet(path: string, teamName = "crew"): unknown {
  switch (path) {
    case "/api/gameday/list/":
      return [GAMEDAY];
    case "/accounts/auth/user/":
      return { id: 1, username: teamName };
    case "/api/gameday/1/":
      return GAMEDAY;
    case "/api/gameday/1/officials/crew":
      return [GAME];
    case "/api/game/42/summary":
      return { game: GAME, gameday: GAMEDAY };
    case "/api/game/42/officials":
      // A complete crew: the start refuses an empty required slot. Free text
      // keeps the team list (which answers []) out of it.
      return [
        { id: 1, official: null, name: "Michael Klein", position: "Referee" },
        { id: 2, official: null, name: "Anna Richter", position: "Down Judge" },
        { id: 3, official: null, name: "Tom Weber", position: "Field Judge" },
        { id: 4, official: null, name: "Sabine Lang", position: "Side Judge" },
      ];
    case "/api/officials/crew-positions/game/42":
      // The league has no configuration, so the backend answers the defaults.
      return [
        {
          position: "Scorecard Judge",
          label: "Scorecard Judge",
          order: 1,
          required: false,
        },
        { position: "Referee", label: "Schiedsrichter", order: 2, required: true },
        { position: "Down Judge", label: "Down Judge", order: 3, required: true },
        { position: "Field Judge", label: "Field Judge", order: 4, required: true },
        { position: "Side Judge", label: "Side Judge", order: 5, required: true },
      ];
    case "/api/officials/team/7/list":
      return [];
    case "/api/game/42/setup":
      return {};
    case "/api/gamelog/42":
      return log();
    case "/api/game/42/roster":
      return [{ side: "home", jersey: 23, name: "Meier" }];
    default:
      throw new Error(`unexpected GET ${path}`);
  }
}

beforeEach(() => {
  // The deep link reads the URL on mount; a leftover parameter would decide
  // the next test's first screen.
  globalThis.history.replaceState(null, "", "/");
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetRuntime();
  resetSnapshotStore();
  calls = [];
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiPutMock.mockReset();
  apiDeleteMock.mockReset();

  apiGetMock.mockImplementation((path: string) => {
    calls.push(`GET ${path}`);
    try {
      return Promise.resolve(routeGet(path));
    } catch (error) {
      return Promise.reject(error);
    }
  });
  apiPutMock.mockImplementation((path: string) => {
    calls.push(`PUT ${path}`);
    if (path === "/api/game/42/finalize") {
      return Promise.resolve({ homeCaptain: "Meier", awayCaptain: "Wolf" });
    }
    return Promise.resolve(undefined);
  });
  apiPostMock.mockImplementation((path: string, body: unknown) => {
    // The append endpoint answers `{state, cursor}`; the log is read after it.
    const events = (body as { events?: { type?: string }[] })?.events ?? [];
    calls.push(`POST ${path}:${events[0]?.type ?? "?"}`);
    return Promise.resolve({ state: {}, cursor: 1 });
  });
  apiDeleteMock.mockImplementation(() =>
    Promise.reject(new ApiError(400, null, "not in this test")),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the whole flow", () => {
  it("walks gameday → game → setup → tracking → finalize → result", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1. Gameday list.
    await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));

    // 2. Games of that gameday.
    expect(await screen.findByText("Ravens – Wolves")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Ravens gegen Wolves/ }),
    );

    // 3. Preparation; the three start fields have no default, then the start
    // button opens the confirmation and its second tap starts.
    expect(
      await screen.findByRole("heading", { name: "Spiel vorbereiten" }),
    ).toBeInTheDocument();
    const picks = [
      ["Münzwurf gewonnen von", "Ravens"],
      ["Erster Ballbesitz", "Ravens"],
      ["Spielrichtung", "Nord"],
    ] as const;
    for (const [group, option] of picks) {
      await user.click(
        within(screen.getByRole("group", { name: group })).getByRole("button", {
          name: option,
        }),
      );
    }
    await user.click(
      await screen.findByRole("button", { name: /Spiel starten/ }),
    );
    // The first tap only opens the confirmation; the second one starts.
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Spiel starten" }),
      ).getByRole("button", { name: "Jetzt starten" }),
    );

    // 4. Tracking: one first down, so a log write happens.
    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "1st Down" }));
    await waitFor(() =>
      expect(
        apiPostMock.mock.calls.filter(([, body]) =>
          (body as { events?: { type?: string }[] }).events?.some(
            (event) => event.type !== "possession",
          ),
        ),
      ).toHaveLength(1),
    );

    // 5. Finalise; "Spielstand bearbeiten" reopens tracking from the server
    // log (never from the optimistic one) and returns here.
    await user.click(
      screen.getByRole("button", { name: "Spiel beenden" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Spielende" }),
    ).toBeInTheDocument();

    const beforeReread = calls.filter(
      (call) => call === "GET /api/gamelog/42",
    ).length;
    await user.click(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "GET /api/gamelog/42").length,
      ).toBeGreaterThan(beforeReread),
    );
    await user.click(
      screen.getByRole("button", { name: "Spiel beenden" }),
    );
    await screen.findByRole("heading", { name: "Spielende" });

    for (const side of ["Ravens", "Wolves"]) {
      const group = screen.getByRole("group", { name: `${side}: Captain` });
      await user.type(within(group).getByRole("combobox"), "Meier");
      await user.click(
        within(group).getByRole("button", { name: "Bestätigen" }),
      );
    }
    await user.click(screen.getByRole("button", { name: "Ergebnis abschicken" }));

    // 6. Result.
    expect(
      await screen.findByRole("heading", { name: "Ergebnis gesendet" }),
    ).toBeInTheDocument();

    // The game is finished from now on: the games snapshot says so and the
    // per-game preload is gone, so an offline boot cannot reopen it as running.
    await waitFor(async () => {
      const saved = await readSnapshot<{ team: string; games: Game[] }>(
        snapshotKey.games(1),
      );
      expect(
        saved?.value.games.find((entry) => entry.id === 42)?.status,
      ).toBe("beendet");
    });
    await expect(readSnapshot(snapshotKey.log(42))).resolves.toBeUndefined();
    await expect(readSnapshot(snapshotKey.setup(42))).resolves.toBeUndefined();

    // The write order is the flow: start, the opening possession as an event,
    // the play as an event, then the result. Nothing writes outside `/events`.
    expect(calls.filter((call) => !call.startsWith("GET"))).toEqual([
      "PUT /api/game/42/setup",
      "POST /api/game/42/events:possession",
      "POST /api/game/42/events:series",
      "PUT /api/game/42/finalize",
    ]);
    // The log was read after the start was accepted, before the event.
    expect(calls.indexOf("GET /api/gamelog/42")).toBeLessThan(
      calls.indexOf("POST /api/game/42/events:series"),
    );
    expect(calls.indexOf("GET /api/game/42/setup")).toBeLessThan(
      calls.indexOf("PUT /api/game/42/setup"),
    );

    // Back to the games refreshes the list.
    const before = calls.filter((call) => call === "GET /api/gameday/1/officials/crew")
      .length;
    await user.click(screen.getByRole("button", { name: "Neues Spiel" }));
    expect(
      await screen.findByText("Ravens – Wolves"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.filter(
          (call) => call === "GET /api/gameday/1/officials/crew",
        ).length,
      ).toBeGreaterThan(before),
    );
  });
});

describe("the deep link", () => {
  it("opens a planned game's preparation straight from ?game=<id>", async () => {
    globalThis.history.replaceState(null, "", "/?game=42");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Spiel vorbereiten" }),
    ).toBeInTheDocument();
    expect(calls).toContain("GET /api/game/42/summary");
    // The link answers both the game and its gameday: no list round-trip.
    expect(calls).not.toContain("GET /api/gameday/1/officials/crew");
  });

  it("opens a running game's tracking screen from the link", async () => {
    const running = { ...GAME, status: "1. Halbzeit" };
    apiGetMock.mockImplementation((path: string) => {
      calls.push(`GET ${path}`);
      if (path === "/api/game/42/summary") {
        return Promise.resolve({ game: running, gameday: GAMEDAY });
      }
      return Promise.resolve(routeGet(path));
    });
    globalThis.history.replaceState(null, "", "/?game=42");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    expect(calls).toContain("GET /api/gamelog/42");
    // The link carried the gameday, so the header has its context line and
    // "back" can load that gameday's games.
    expect(screen.getByText(/Herbsttag · Landesliga/)).toBeInTheDocument();
  });

  it("opens a game from its gameday path and keeps it in the address", async () => {
    const running = { ...GAME, status: "1. Halbzeit" };
    apiGetMock.mockImplementation((path: string) => {
      calls.push(`GET ${path}`);
      if (path === "/api/game/42/summary") {
        return Promise.resolve({ game: running, gameday: GAMEDAY });
      }
      return Promise.resolve(routeGet(path));
    });
    globalThis.history.replaceState(
      null,
      "",
      "/scorecard/v2/gameday/1/game/42/",
    );
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    expect(globalThis.location.pathname).toBe(
      "/scorecard/v2/gameday/1/game/42/",
    );
    expect(calls).toContain("GET /api/gamelog/42");
  });

  it("opens a gameday from its own path", async () => {
    globalThis.history.replaceState(null, "", "/scorecard/v2/gameday/1/");
    render(<App />);

    expect(
      await screen.findByText("Ravens – Wolves"),
    ).toBeInTheDocument();
    expect(calls).toContain("GET /api/gameday/1/");
    expect(globalThis.location.pathname).toBe("/scorecard/v2/gameday/1/");
  });

  it("moves a legacy game path onto the gameday address", async () => {
    const running = { ...GAME, status: "1. Halbzeit" };
    apiGetMock.mockImplementation((path: string) => {
      calls.push(`GET ${path}`);
      if (path === "/api/game/42/summary") {
        return Promise.resolve({ game: running, gameday: GAMEDAY });
      }
      return Promise.resolve(routeGet(path));
    });
    globalThis.history.replaceState(null, "", "/scorecard/v2/spiel/42/");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(globalThis.location.pathname).toBe(
        "/scorecard/v2/gameday/1/game/42/",
      ),
    );
  });

  it("keeps the address in step with the screen", async () => {
    const user = userEvent.setup();
    globalThis.history.replaceState(null, "", "/scorecard/v2/");
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));
    expect(globalThis.location.pathname).toBe("/scorecard/v2/gameday/1/");
    await user.click(
      await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Spiel vorbereiten" }),
    ).toBeInTheDocument();
    expect(globalThis.location.pathname).toBe(
      "/scorecard/v2/gameday/1/game/42/",
    );

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    expect(
      await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
    ).toBeInTheDocument();
    expect(globalThis.location.pathname).toBe("/scorecard/v2/gameday/1/");
  });

  it("ignores a game parameter that is not an id", async () => {
    globalThis.history.replaceState(null, "", "/?game=abc");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.includes("/summary"))).toBe(false);
  });

  it("retries the link after a failed read", async () => {
    let attempts = 0;
    apiGetMock.mockImplementation((path: string) => {
      calls.push(`GET ${path}`);
      if (path === "/api/game/42/summary") {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new Error("Netz weg"));
        }
        return Promise.resolve({ game: GAME, gameday: GAMEDAY });
      }
      return Promise.resolve(routeGet(path));
    });
    const user = userEvent.setup();
    globalThis.history.replaceState(null, "", "/?game=42");
    render(<App />);

    await screen.findByRole("alert", {}, { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: "Erneut laden" }));

    expect(
      await screen.findByRole("heading", { name: "Spiel vorbereiten" }),
    ).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("keeps a broken link on its own screen with a retry", async () => {
    apiGetMock.mockImplementation((path: string) =>
      path === "/api/game/42/summary"
        ? Promise.reject(new Error("Spiel nicht erreichbar"))
        : Promise.resolve(routeGet(path)),
    );
    globalThis.history.replaceState(null, "", "/?game=42");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Spiel wird geöffnet" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Erneut laden" }),
    ).toBeInTheDocument();
  });
});
