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
    case "/api/gameday/1/officials/crew":
      return [GAME];
    case "/api/game/42/officials":
      return [];
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
  apiPostMock.mockImplementation((path: string) => {
    calls.push(`POST ${path}`);
    return Promise.resolve(log({ home: team({ score: 0 }) }));
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

    // 3. Preparation; the start button becomes the way in.
    expect(
      await screen.findByRole("heading", { name: "Vorbereitung" }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: /Spiel starten/ }),
    );

    // 4. Tracking: one first down, so a log write happens.
    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "1st Down" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Speichern",
      }),
    );
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));

    // 5. Finalise; "Spielstand bearbeiten" reopens tracking from the server
    // log (never from the optimistic one) and returns here.
    await user.click(
      screen.getByRole("button", { name: "Spielende und Bestätigung" }),
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
      screen.getByRole("button", { name: "Spielende und Bestätigung" }),
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

    // The write order is the flow: start, first possession, the event, then
    // the result.
    expect(calls.filter((call) => !call.startsWith("GET"))).toEqual([
      "PUT /api/game/42/setup",
      "PUT /api/game/42/possession",
      "POST /api/gamelog/42",
      "PUT /api/game/42/finalize",
    ]);
    // The log was read after the start was accepted, before the event.
    expect(calls.indexOf("GET /api/gamelog/42")).toBeLessThan(
      calls.indexOf("POST /api/gamelog/42"),
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
