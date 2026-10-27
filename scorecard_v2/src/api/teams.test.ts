import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet } from "./client";
import {
  loadTeamLogos,
  teamKey,
  teamLogosFrom,
  type TeamDirectoryEntry,
  type TeamsPage,
} from "./teams";
import {
  readSnapshot,
  resetSnapshotStore,
  snapshotKey,
  writeSnapshot,
} from "../offline/snapshot";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, apiGet: vi.fn() };
});

const apiGetMock = apiGet as unknown as Mock;

const RENEGADES_LOGO =
  "https://example.test/media/teammanager/logos/nuern.png";

/** `GET /api/teams/` as the backend really answers it: a page, not a list. */
function page(
  results: TeamDirectoryEntry[],
  next: string | null = null,
): TeamsPage {
  return { count: results.length, next, previous: null, results };
}

const TEAMS: TeamDirectoryEntry[] = [
  {
    id: 1,
    name: "Nürnberg Renegades",
    description: "Renegades",
    logo: RENEGADES_LOGO,
  },
  {
    id: 2,
    name: "Erlangen Sharks",
    description: "Sharks",
    logo: null,
  },
];

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetSnapshotStore();
  apiGetMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("teamKey", () => {
  it("normalises the name the payload and the screens use", () => {
    expect(teamKey("  Nürnberg Renegades ")).toBe("nürnberg renegades");
    expect(teamKey("RENEGADES")).toBe("renegades");
    expect(teamKey(null)).toBe("");
    expect(teamKey("   ")).toBe("");
  });
});

describe("teamLogosFrom", () => {
  it("maps both the long name and the short description to the logo", () => {
    const logos = teamLogosFrom(TEAMS);

    expect(logos.get(teamKey("Nürnberg Renegades"))).toBe(RENEGADES_LOGO);
    // The games list shows `Team.description`, the log `Team.name`.
    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
  });

  it("leaves a team without a logo out of the map", () => {
    const logos = teamLogosFrom(TEAMS);

    expect(logos.has(teamKey("Erlangen Sharks"))).toBe(false);
    expect(logos.has(teamKey("Sharks"))).toBe(false);
  });

  it("ignores blank logos and blank names", () => {
    const logos = teamLogosFrom([
      { id: 3, name: "Ravens", description: "Ravens", logo: "" },
      { id: 4, name: "Wolves", description: "Wolves", logo: "   " },
      { id: 5, name: "", description: "", logo: RENEGADES_LOGO },
    ]);

    expect(logos.size).toBe(0);
  });
});

describe("loadTeamLogos", () => {
  it("reads the paginated directory and builds the lookup", async () => {
    apiGetMock.mockResolvedValue(page(TEAMS));

    const logos = await loadTeamLogos();

    expect(apiGetMock).toHaveBeenCalledWith("/api/teams/?page_size=1000");
    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
    expect(logos.has(teamKey("Sharks"))).toBe(false);
  });

  it("follows `next` so a directory above one page stays complete", async () => {
    const next = "https://example.test/api/teams/?page=2&page_size=1000";
    apiGetMock
      .mockResolvedValueOnce(page([TEAMS[0]], next))
      .mockResolvedValueOnce(
        page([
          {
            id: 9,
            name: "Bamberg Bears",
            description: "Bears",
            logo: "https://example.test/media/teammanager/logos/bamberg.png",
          },
        ]),
      );

    const logos = await loadTeamLogos();

    expect(apiGetMock).toHaveBeenCalledTimes(2);
    // Same origin, path only: the host DRF builds a link with is not trusted.
    expect(apiGetMock).toHaveBeenLastCalledWith(
      "/api/teams/?page=2&page_size=1000",
    );
    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
    expect(logos.get(teamKey("Bears"))).toBe(
      "https://example.test/media/teammanager/logos/bamberg.png",
    );
  });

  it("stores the mapping in the snapshot store for the next offline boot", async () => {
    apiGetMock.mockResolvedValue(page(TEAMS));

    await loadTeamLogos();

    const saved = await readSnapshot<[string, string][]>(snapshotKey.teams());
    expect(saved?.value).toEqual([[teamKey("Nürnberg Renegades"), RENEGADES_LOGO], [teamKey("Renegades"), RENEGADES_LOGO]]);
  });

  it("answers from the cache without a request when the browser is offline", async () => {
    await writeSnapshot<[string, string][]>(snapshotKey.teams(), [
      [teamKey("Renegades"), RENEGADES_LOGO],
    ]);
    vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(false);

    const logos = await loadTeamLogos();

    expect(apiGetMock).not.toHaveBeenCalled();
    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
  });

  it("falls back to the cached mapping when the request fails", async () => {
    await writeSnapshot<[string, string][]>(snapshotKey.teams(), [
      [teamKey("Renegades"), RENEGADES_LOGO],
    ]);
    apiGetMock.mockRejectedValue(new ApiError(0, null, "offline"));

    const logos = await loadTeamLogos();

    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
  });

  it("resolves to an empty map when there is neither network nor cache", async () => {
    vi.spyOn(globalThis.navigator, "onLine", "get").mockReturnValue(false);
    apiGetMock.mockRejectedValue(new ApiError(0, null, "offline"));

    await expect(loadTeamLogos()).resolves.toEqual(new Map());
  });

  it("never rejects when the server answers with an error", async () => {
    apiGetMock.mockRejectedValue(new ApiError(500, null, "kaputt"));

    await expect(loadTeamLogos()).resolves.toEqual(new Map());
  });

  it("survives a bucket that answers with a bare list", async () => {
    apiGetMock.mockResolvedValue(TEAMS);

    const logos = await loadTeamLogos();

    expect(logos.get(teamKey("Renegades"))).toBe(RENEGADES_LOGO);
  });
});
