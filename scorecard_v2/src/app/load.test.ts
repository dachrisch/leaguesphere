// The read layer between the flow and the API: every loader once online, once
// from the snapshot, and once with neither (so the error reaches the panel).
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet } from "../api/client";
import type { Gameday, Game, GameLog, GameLogTeam } from "../api/types";
import {
  dropGameSnapshots,
  loadGamedays,
  loadGames,
  loadGamesMeta,
  loadLog,
  loadLogMeta,
  loadUser,
  markGameFinished,
  messageOf,
} from "./load";
import {
  readSnapshot,
  resetSnapshotStore,
  snapshotKey,
  writeSnapshot,
} from "../offline/snapshot";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, apiGet: vi.fn() };
});

const apiGetMock = apiGet as unknown as Mock;

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

const LOG: GameLog = {
  gameId: 42,
  isFirstHalf: true,
  inPossession: "Ravens",
  events: [],
  home: team(),
  away: team({ id: 2, name: "Wolves" }),
};

let online = true;

beforeEach(() => {
  online = true;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.spyOn(globalThis.navigator, "onLine", "get").mockImplementation(
    () => online,
  );
  resetSnapshotStore();
  apiGetMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the simple loaders", () => {
  it("reads the user, the gamedays and one log from the API", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/accounts/auth/user/") {
        return Promise.resolve({ id: 7, username: "crew" });
      }
      if (path === "/api/gameday/list/") return Promise.resolve([GAMEDAY]);
      if (path === "/api/gamelog/42") return Promise.resolve(LOG);
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    await expect(loadUser()).resolves.toEqual({ id: 7, username: "crew" });
    await expect(loadGamedays()).resolves.toEqual([GAMEDAY]);
    await expect(loadLog(42)).resolves.toEqual(LOG);
    // Each successful read is kept for the next offline boot.
    await expect(readSnapshot(snapshotKey.gamedays())).resolves.toMatchObject({
      value: [GAMEDAY],
    });
    await expect(readSnapshot(snapshotKey.log(42))).resolves.toMatchObject({
      value: LOG,
    });
  });

  it("falls back to the stored log when the request fails", async () => {
    await writeSnapshot(snapshotKey.log(42), LOG);
    apiGetMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

    await expect(loadLog(42)).resolves.toEqual(LOG);
  });
});

describe("loadGamesMeta", () => {
  it("is offline first: the snapshot answers without a request", async () => {
    online = false;
    const saved = { team: "crew", games: [GAME] };
    await writeSnapshot(snapshotKey.games(1), saved);

    await expect(loadGamesMeta(1, "crew")).resolves.toEqual({
      value: [GAME],
      updatedAt: expect.any(Number),
    });
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("still asks when offline and no snapshot exists", async () => {
    online = false;
    apiGetMock.mockResolvedValue([GAME]);

    await expect(loadGamesMeta(1, "*")).resolves.toEqual({
      value: [GAME],
      updatedAt: null,
    });
    expect(apiGetMock).toHaveBeenCalledWith("/api/gameday/1/officials/*");
  });

  it("stores the team alongside the games", async () => {
    apiGetMock.mockResolvedValue([GAME]);

    await loadGamesMeta(1, "crew");

    await expect(
      readSnapshot<{ team: string; games: Game[] }>(snapshotKey.games(1)),
    ).resolves.toMatchObject({ value: { team: "crew", games: [GAME] } });
  });

  it("answers from the snapshot with its age when the request fails", async () => {
    await writeSnapshot(snapshotKey.games(1), { team: "crew", games: [GAME] });
    const saved = await readSnapshot(snapshotKey.games(1));
    apiGetMock.mockRejectedValue(new ApiError(503, null, "Wartung"));

    await expect(loadGamesMeta(1, "crew")).resolves.toEqual({
      value: [GAME],
      updatedAt: saved?.updatedAt,
    });
  });

  it("rethrows when the request failed and nothing is stored", async () => {
    const failure = new ApiError(503, null, "Wartung");
    apiGetMock.mockRejectedValue(failure);

    await expect(loadGamesMeta(1, "crew")).rejects.toBe(failure);
  });

  it("loadGames returns only the list", async () => {
    await writeSnapshot(snapshotKey.games(1), { team: "crew", games: [GAME] });
    online = false;

    await expect(loadGames(1, "crew")).resolves.toEqual([GAME]);
  });
});

describe("loadLogMeta", () => {
  it("reports a live answer as fresh and a stored one with its age", async () => {
    apiGetMock.mockResolvedValue(LOG);

    await expect(loadLogMeta(42)).resolves.toEqual({
      value: LOG,
      updatedAt: null,
    });

    await writeSnapshot(snapshotKey.log(42), LOG);
    const saved = await readSnapshot(snapshotKey.log(42));
    apiGetMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));
    await expect(loadLogMeta(42)).resolves.toEqual({
      value: LOG,
      updatedAt: saved?.updatedAt,
    });
  });
});

describe("markGameFinished", () => {
  it("marks only that game and keeps the rest of the snapshot", async () => {
    const other = { ...GAME, id: 43, status: "Geplant" as const };
    await writeSnapshot(snapshotKey.games(1), {
      team: "crew",
      games: [GAME, other],
    });

    await markGameFinished(1, 42);

    const saved = await readSnapshot<{ team: string; games: Game[] }>(
      snapshotKey.games(1),
    );
    expect(saved?.value.team).toBe("crew");
    expect(saved?.value.games).toEqual([
      { ...GAME, status: "beendet" },
      other,
    ]);
  });

  it("does nothing when no games were ever stored", async () => {
    await expect(markGameFinished(1, 42)).resolves.toBeUndefined();
    await expect(readSnapshot(snapshotKey.games(1))).resolves.toBeUndefined();
  });
});

describe("dropGameSnapshots", () => {
  it("drops the log and the setup but keeps the roster and penalties", async () => {
    await writeSnapshot(snapshotKey.log(42), LOG);
    await writeSnapshot(snapshotKey.setup(42), { ctResult: "home" });
    await writeSnapshot(snapshotKey.roster(42), []);
    await writeSnapshot(snapshotKey.penalties(), []);

    await dropGameSnapshots(42);

    await expect(readSnapshot(snapshotKey.log(42))).resolves.toBeUndefined();
    await expect(readSnapshot(snapshotKey.setup(42))).resolves.toBeUndefined();
    await expect(readSnapshot(snapshotKey.roster(42))).resolves.toBeDefined();
    await expect(readSnapshot(snapshotKey.penalties())).resolves.toBeDefined();
  });
});

describe("messageOf", () => {
  it("prefers the server's own text", () => {
    expect(
      messageOf(new ApiError(409, {}, "  Gerät gesperrt.  "), "fallback"),
    ).toBe("Gerät gesperrt.");
  });

  it("falls back for a blank detail and for anything that is not an ApiError", () => {
    expect(messageOf(new ApiError(500, {}, "   "), "fallback")).toBe("fallback");
    expect(messageOf(new ApiError(500, {}), "fallback")).toBe("fallback");
    expect(messageOf(new Error("kaputt"), "fallback")).toBe("fallback");
    expect(messageOf("kaputt", "fallback")).toBe("fallback");
  });
});
