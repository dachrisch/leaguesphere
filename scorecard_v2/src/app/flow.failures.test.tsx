// The flow's failure and navigation paths: every fetch that can fail, every
// back that has to refetch, the team toggle, the unload guard and the logout.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { StrictMode } from "react";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import App from "../App";
import { ApiError, apiGet, apiPost, apiPut } from "../api/client";
import type { Gameday, Game, GameLog, GameLogTeam } from "../api/types";
import {
  removeSnapshot,
  resetSnapshotStore,
  snapshotKey,
} from "../offline/snapshot";
import { getRuntime, resetRuntime } from "../session/runtime";
import { queuedWrites } from "../session/logout";

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

const PLANNED: Game = {
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

/** Requests the test wants to fail, with the failure and how often. */
let failures = new Map<string, { error: unknown; times: number }>();
/** Requests the test wants to delay until it releases them. */
let gates = new Map<string, Promise<void>>();
let username = "crew";
let gamesStatus: Game["status"] = "Geplant";
let calls: string[] = [];

function fail(path: string, error: unknown, times = Infinity): void {
  failures.set(path, { error, times });
}

function hold(path: string, gate: Promise<void>): void {
  gates.set(path, gate);
}

function routeGet(path: string): unknown {
  switch (path) {
    case "/api/gameday/list/":
      return [GAMEDAY];
    case "/accounts/auth/user/":
      return { id: 1, username };
    case "/api/gameday/1/officials/crew":
    case "/api/gameday/1/officials/*":
      return [{ ...PLANNED, status: gamesStatus }];
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
      return [];
    default:
      throw new Error(`unexpected GET ${path}`);
  }
}

beforeEach(() => {
  // The team toggle writes `?team=*`; a test must not inherit it.
  globalThis.history.replaceState(null, "", "/");
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetRuntime();
  resetSnapshotStore();
  failures = new Map();
  gates = new Map();
  username = "crew";
  gamesStatus = "Geplant";
  calls = [];
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiPutMock.mockReset();

  apiGetMock.mockImplementation(async (path: string) => {
    calls.push(`GET ${path}`);
    const gate = gates.get(path);
    if (gate !== undefined) {
      await gate;
    }
    const failure = failures.get(path);
    if (failure !== undefined && failure.times > 0) {
      failure.times -= 1;
      throw failure.error;
    }
    return routeGet(path);
  });
  apiPostMock.mockImplementation(async (path: string) => {
    calls.push(`POST ${path}`);
    return log();
  });
  apiPutMock.mockImplementation(async (path: string) => {
    calls.push(`PUT ${path}`);
    if (path === "/api/game/42/finalize") {
      return { homeCaptain: "Meier", awayCaptain: "Wolf" };
    }
    return undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openGameday(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));
}

async function openRunningGame(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  gamesStatus = "1. Halbzeit";
  render(<App />);
  await openGameday(user);
  await user.click(
    await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
  );
}

describe("the gameday list", () => {
  it("shows the loading panel before the answer arrives", async () => {
    let release = (): void => undefined;
    hold(
      "/api/gameday/list/",
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Einen Moment …")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Die Daten werden geladen.",
    );

    release();
    expect(
      await screen.findByRole("button", { name: /Herbsttag/ }),
    ).toBeInTheDocument();
  });

  it("shows the server's reason and loads again on demand", async () => {
    fail(
      "/api/gameday/list/",
      new ApiError(500, null, "Die Datenbank ist nicht erreichbar."),
      1,
    );
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Datenbank ist nicht erreichbar.",
    );

    await user.click(screen.getByRole("button", { name: "Erneut laden" }));

    expect(
      await screen.findByRole("button", { name: /Herbsttag/ }),
    ).toBeInTheDocument();
  });

  it("falls back to its own message for a failure without a detail", async () => {
    fail("/api/gameday/list/", new TypeError("Failed to fetch"), 1);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Spieltage konnten nicht geladen werden. Bitte erneut versuchen.",
    );
  });

  it("boots once, even under StrictMode's double mount", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await screen.findByRole("button", { name: /Herbsttag/ });
    expect(
      calls.filter((call) => call === "GET /api/gameday/list/"),
    ).toHaveLength(1);
  });

  it("falls back to the whole gameday when the user cannot be read", async () => {
    fail("/accounts/auth/user/", new ApiError(401, null, "Anmeldung"));
    const user = userEvent.setup();
    render(<App />);

    await openGameday(user);

    await screen.findByText("Ravens – Wolves");
    expect(calls).toContain("GET /api/gameday/1/officials/*");
  });

  it("logs out from the list when the official declines the warning", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    // The boot flush fails, so the queued write is still there when the
    // official taps "Abmelden".
    apiPostMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));
    await getRuntime().outbox.enqueue({
      id: "queued",
      gameId: 42,
      kind: "event",
      payload: {},
      createdAt: 1,
      attempts: 0,
      deviceId: "device-a",
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Herbsttag/ });
    expect(await queuedWrites()).toEqual({ pending: 1, failed: 0 });

    await user.click(screen.getByRole("button", { name: "Abmelden" }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        "1 Eintrag ist noch nicht übertragen. Trotzdem abmelden?",
      ),
    );
    // Still on the gameday list: the official said no, the queue is intact.
    expect(screen.getByRole("heading", { name: "Meine Spieltage" })).toBeInTheDocument();
    expect(await queuedWrites()).toEqual({ pending: 1, failed: 0 });
  });
});

describe("the games list", () => {
  it("starts with the whole gameday when the URL asks for it", async () => {
    globalThis.history.replaceState(null, "", "/?team=*");
    const user = userEvent.setup();
    render(<App />);

    await openGameday(user);

    expect(
      await screen.findByRole("button", { name: "Alle Spiele" }),
    ).toBeInTheDocument();
    expect(calls).toContain("GET /api/gameday/1/officials/*");
    expect(calls).not.toContain("GET /api/gameday/1/officials/crew");

    // Toggling back narrows the list to the official's crew and drops the
    // parameter from the URL.
    await user.click(screen.getByRole("button", { name: "Alle Spiele" }));

    expect(
      await screen.findByRole("button", { name: "Meine Spiele" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls).toContain("GET /api/gameday/1/officials/crew"),
    );
    expect(globalThis.location.search).toBe("");

    // And back to the whole gameday, which writes the parameter again.
    await user.click(screen.getByRole("button", { name: "Meine Spiele" }));

    await waitFor(() => expect(globalThis.location.search).toBe("?team=*"));
    expect(
      await screen.findByRole("button", { name: "Alle Spiele" }),
    ).toBeInTheDocument();
  });

  it("asks for the whole gameday when the user has no name", async () => {
    username = "   ";
    const user = userEvent.setup();
    render(<App />);

    await openGameday(user);

    await screen.findByText("Ravens – Wolves");
    expect(calls).toContain("GET /api/gameday/1/officials/*");
  });

  it("shows the games error and retries without leaving the gameday", async () => {
    fail(
      "/api/gameday/1/officials/crew",
      new ApiError(503, null, "Der Spielplan wird gerade gewartet."),
      1,
    );
    const user = userEvent.setup();
    render(<App />);
    await openGameday(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Spielplan wird gerade gewartet.",
    );

    await user.click(screen.getByRole("button", { name: "Erneut laden" }));

    expect(await screen.findByText("Ravens – Wolves")).toBeInTheDocument();
  });

  it("ignores a games failure that lands after the official went back", async () => {
    let reject = (): void => undefined;
    hold(
      "/api/gameday/1/officials/crew",
      new Promise<void>((resolve) => {
        reject = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await openGameday(user);
    // The loading panel can go back to the gamedays.
    expect(screen.getByText("Einen Moment …")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zurück" }));

    fail("/api/gameday/1/officials/crew", new ApiError(500, null, "spät"));
    reject();

    expect(
      await screen.findByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("goes back from the games to the gamedays", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGameday(user);
    await screen.findByText("Ravens – Wolves");

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    expect(
      await screen.findByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
  });
});

describe("opening a running game", () => {
  it("shows a failed log read, retries it and opens tracking", async () => {
    fail(
      "/api/gamelog/42",
      new ApiError(500, null, "Der Verlauf klemmt."),
      1,
    );
    const user = userEvent.setup();
    await openRunningGame(user);

    expect(
      await screen.findByRole("heading", { name: "Spiel wird geöffnet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Der Verlauf klemmt.");

    await user.click(screen.getByRole("button", { name: "Erneut laden" }));

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
  });

  it("can abandon a failed log read and stay on the games", async () => {
    fail("/api/gamelog/42", new ApiError(500, null, "Der Verlauf klemmt."), 1);
    const user = userEvent.setup();
    await openRunningGame(user);
    await screen.findByRole("heading", { name: "Spiel wird geöffnet" });

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    expect(await screen.findByText("Ravens – Wolves")).toBeInTheDocument();
  });

  it("refetches the games after leaving tracking", async () => {
    const user = userEvent.setup();
    await openRunningGame(user);
    await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" });
    const before = calls.filter(
      (call) => call === "GET /api/gameday/1/officials/crew",
    ).length;

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    await screen.findByText("Ravens – Wolves");
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "GET /api/gameday/1/officials/crew"),
      ).toHaveLength(before + 1),
    );
  });

  it("guards the tab only while a game is running", async () => {
    const user = userEvent.setup();
    await openRunningGame(user);
    await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" });

    const running = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(running);
    expect(running.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: "Zurück" }));
    await screen.findByText("Ravens – Wolves");

    const stopped = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(stopped);
    expect(stopped.defaultPrevented).toBe(false);
  });
});

describe("the preparation", () => {
  it("refetches the games after leaving the preparation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGameday(user);
    await user.click(
      await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
    );
    await screen.findByRole("heading", { name: "Vorbereitung" });
    const before = calls.filter(
      (call) => call === "GET /api/gameday/1/officials/crew",
    ).length;

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    await screen.findByText("Ravens – Wolves");
    expect(
      calls.filter((call) => call === "GET /api/gameday/1/officials/crew"),
    ).toHaveLength(before + 1);
  });
});

describe("starting a game", () => {
  it("opens tracking and refreshes the games snapshot after the start", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGameday(user);
    await user.click(
      await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
    );
    await screen.findByRole("heading", { name: "Vorbereitung" });
    const before = calls.filter(
      (call) => call === "GET /api/gameday/1/officials/crew",
    ).length;

    const picks = [
      ["Münzwurf", "Ravens"],
      ["Erster Ballbesitz", "Ravens"],
      ["Richtung", "Ost → West"],
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

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    // The best-effort snapshot refresh runs behind the tracking screen.
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "GET /api/gameday/1/officials/crew"),
      ).toHaveLength(before + 1),
    );
  });
});

describe("the finalise screen", () => {
  async function openFinalize(
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<void> {
    await openRunningGame(user);
    await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" });
    await user.click(
      screen.getByRole("button", { name: "Spielende und Bestätigung" }),
    );
    await screen.findByRole("heading", { name: "Spielende" });
  }

  async function confirmBoth(
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<void> {
    for (const side of ["Ravens", "Wolves"]) {
      const group = screen.getByRole("group", { name: `${side}: Captain` });
      await user.type(within(group).getByRole("combobox"), "Meier");
      await user.click(
        within(group).getByRole("button", { name: "Bestätigen" }),
      );
    }
  }

  it("goes back to tracking and re-reads the server log", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    const before = calls.filter((call) => call === "GET /api/gamelog/42").length;

    await user.click(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    );

    await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" });
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "GET /api/gamelog/42"),
      ).toHaveLength(before + 1),
    );
  });

  it("falls back to tracking when the re-read fails", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    await removeSnapshot(snapshotKey.log(42));
    fail("/api/gamelog/42", new ApiError(500, null, "klemmt"));

    await user.click(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" }),
    ).toBeInTheDocument();
    // The log it already held is still shown; no error panel appeared.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the result when a 409 says another device finished the game", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    await confirmBoth(user);
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { detail: "Das Spiel ist bereits beendet." }, "Das Spiel ist bereits beendet."),
    );
    gamesStatus = "beendet";

    await user.click(
      screen.getByRole("button", { name: "Ergebnis abschicken" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Ergebnis gesendet" }),
    ).toBeInTheDocument();

    // "Neues Spiel" refetches the games, which now show the finished game.
    gamesStatus = "beendet";
    await user.click(screen.getByRole("button", { name: "Neues Spiel" }));

    expect(await screen.findByText("Ravens – Wolves")).toBeInTheDocument();
  });

  it("keeps the error when the conflict is not a finished game", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    await confirmBoth(user);
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { detail: "Erst die Halbzeit beenden." }, "Erst die Halbzeit beenden."),
    );
    gamesStatus = "1. Halbzeit";

    await user.click(
      screen.getByRole("button", { name: "Ergebnis abschicken" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erst die Halbzeit beenden.",
    );
    expect(
      screen.queryByRole("heading", { name: "Ergebnis gesendet" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the error when the game vanished from the list", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    await confirmBoth(user);
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { detail: "Konflikt." }, "Konflikt."),
    );
    const real = apiGetMock.getMockImplementation();
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === "/api/gameday/1/officials/crew") {
        return [];
      }
      return real ? real(path) : undefined;
    });

    await user.click(
      screen.getByRole("button", { name: "Ergebnis abschicken" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Konflikt.");
  });

  it("keeps the error when the conflict re-read fails", async () => {
    const user = userEvent.setup();
    await openFinalize(user);
    await confirmBoth(user);
    apiPutMock.mockRejectedValueOnce(
      new ApiError(409, { detail: "Konflikt." }, "Konflikt."),
    );
    await removeSnapshot(snapshotKey.games(1));
    const real = apiGetMock.getMockImplementation();
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === "/api/gameday/1/officials/crew") {
        throw new ApiError(0, null, "Keine Verbindung");
      }
      return real ? real(path) : undefined;
    });

    await user.click(
      screen.getByRole("button", { name: "Ergebnis abschicken" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Konflikt.");
  });
});
