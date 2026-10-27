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
});
