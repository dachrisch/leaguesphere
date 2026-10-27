import { beforeEach, expect, vi } from "vitest";

const { apiGet, apiPut, apiGetBlobUrl } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiGetBlobUrl: vi.fn(),
}));

vi.mock("../client", () => ({ apiGet, apiPut, apiGetBlobUrl }));

import {
  fetchGames,
  fetchPhotoUrl,
  fetchRoster,
  saveRoster,
} from "../passcheck";

beforeEach(() => {
  vi.clearAllMocks();
});

it("loads today's games and a specific gameday", async () => {
  apiGet.mockResolvedValue({ games: [] });

  await fetchGames();
  await fetchGames(7);

  expect(apiGet).toHaveBeenNthCalledWith(1, "/api/passcheck/games");
  expect(apiGet).toHaveBeenNthCalledWith(2, "/api/passcheck/games/7");
});

it("loads a roster for a team and gameday", async () => {
  apiGet.mockResolvedValue({ team: {} });

  await fetchRoster(3, 7);

  expect(apiGet).toHaveBeenCalledWith(
    "/api/passcheck/roster/3/gameday/7"
  );
});

it("saves a roster", async () => {
  const payload = {
    official_name: "M. Weber",
    note: null,
    roster: [{ id: 1, jersey_number: 7 }],
    client_id: "c1",
    device_id: "d1",
  };
  apiPut.mockResolvedValue(undefined);

  await saveRoster(3, 7, payload);

  expect(apiPut).toHaveBeenCalledWith(
    "/api/passcheck/roster/3/gameday/7",
    payload
  );
});

it("fetches the photo as an authenticated blob URL", async () => {
  apiGetBlobUrl.mockResolvedValue("blob:3");

  await expect(fetchPhotoUrl(3, 7)).resolves.toBe("blob:3");

  expect(apiGetBlobUrl).toHaveBeenCalledWith(
    "/api/passcheck/photos/3/gameday/7"
  );
});
