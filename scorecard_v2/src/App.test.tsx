import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { apiGet } from "./api/client";
import type { Gameday } from "./api/types";
import App from "./App";
import { resetSnapshotStore } from "./offline/snapshot";
import { resetRuntime } from "./session/runtime";

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return { ...actual, apiGet: vi.fn() };
});

const apiGetMock = apiGet as unknown as Mock;

const GAMEDAY: Gameday = {
  id: 1,
  name: "Testtag",
  season: 1,
  league: 2,
  league_display: "Liga",
  date: "2026-10-26",
  start: "10:00",
  format: "6_2",
  author: 1,
  address: "Sportplatz",
  status: "PUBLISHED",
  published_at: null,
  updated_at: "2026-10-26T08:00:00Z",
  resource_urls: [],
};

const TEAMS_PATH = "/api/teams/?page_size=1000";

const TEAMS_PAGE = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      name: "Ravens",
      description: "Ravens",
      logo: "https://example.test/media/teammanager/logos/ravens.png",
    },
  ],
};

beforeEach(() => {
  resetRuntime();
  resetSnapshotStore();
  apiGetMock.mockReset();
  apiGetMock.mockImplementation((path: string) => {
    if (path === "/api/gameday/list/") {
      return Promise.resolve([GAMEDAY]);
    }
    if (path === "/accounts/auth/user/") {
      return Promise.resolve({ id: 1, username: "crew" });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

describe("App", () => {
  it("renders the gameday heading", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Meine Spieltage" }),
    ).toBeInTheDocument();
  });

  it("renders the gamedays the API answered", async () => {
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /Testtag/ }),
    ).toBeInTheDocument();
  });

  it("reads the team directory once per boot", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/api/gameday/list/") {
        return Promise.resolve([GAMEDAY]);
      }
      if (path === "/accounts/auth/user/") {
        return Promise.resolve({ id: 1, username: "crew" });
      }
      if (path === TEAMS_PATH) {
        return Promise.resolve(TEAMS_PAGE);
      }
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });

    render(<App />);
    await screen.findByRole("button", { name: /Testtag/ });

    expect(
      apiGetMock.mock.calls.filter(([path]) => path === TEAMS_PATH),
    ).toHaveLength(1);
  });

  it("shows the gamedays even when the team directory fails", async () => {
    // The default mock rejects every path but the gameday list and the user.
    render(<App />);

    expect(
      await screen.findByRole("button", { name: /Testtag/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
