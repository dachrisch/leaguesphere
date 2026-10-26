import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, vi } from "vitest";

import App from "../App";
import {
  fetchGames,
  fetchPhotoUrl,
  fetchRoster,
  saveRoster,
} from "../api/passcheck";
import type {
  GamesResponse,
  RosterEntry,
  RosterResponse,
} from "../api/types";

vi.mock("../api/passcheck", () => ({
  fetchGames: vi.fn(),
  fetchRoster: vi.fn(),
  saveRoster: vi.fn(),
  fetchPhotoUrl: vi.fn(),
}));

const mockedGames = vi.mocked(fetchGames);
const mockedRoster = vi.mocked(fetchRoster);
const mockedSave = vi.mocked(saveRoster);
const mockedPhoto = vi.mocked(fetchPhotoUrl);

const games: GamesResponse = {
  officialsTeamName: "Officials",
  gamedays: [{ id: 7, name: "Spieltag 7" }],
  games: [
    {
      gameday_id: 7,
      field: 1,
      scheduled: "10:00:00",
      home: { id: 1, name: "Home", isChecked: false },
      away: { id: 2, name: "Away", isChecked: false },
    },
  ],
};

function player(id: number): RosterEntry {
  return {
    id,
    jersey_number: id,
    first_name: "Jonas",
    last_name: `Brenner${id}`,
    pass_number: 1000 + id,
    isSelected: false,
  };
}

const roster: RosterResponse = {
  is_user_or_staff: false,
  all_leagues: [],
  team_id: 1,
  related_teams: [],
  years: [2026],
  official_name: "",
  note: null,
  team: {
    name: "Home",
    roster: [player(1), player(2)],
    validator: { minimum_player_strength: 1 },
  },
  additionalTeams: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedGames.mockResolvedValue(games);
  mockedRoster.mockResolvedValue(roster);
  mockedSave.mockResolvedValue(undefined);
  mockedPhoto.mockRejectedValue(new Error("no photo"));
});

it("walks from the game list to a saved verification", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: /Home/ }));

  expect(await screen.findByText(/0 von 2/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Jonas Brenner1" }));
  expect(screen.getByText(/1 von 2/)).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Prüfung abschließen" })
  );
  await user.type(screen.getByLabelText("Abgenommen durch"), "M. Weber");
  await user.click(screen.getByRole("button", { name: "Passliste speichern" }));

  expect(
    await screen.findByRole("heading", { name: "Passliste gespeichert" })
  ).toBeInTheDocument();

  expect(mockedSave).toHaveBeenCalledTimes(1);
  const [, , payload] = mockedSave.mock.calls[0];
  expect(payload.official_name).toBe("M. Weber");
  expect(payload.roster).toEqual([{ id: 1, jersey_number: 1 }]);
  expect(payload.client_id).toBeTruthy();
  expect(payload.device_id).toBeTruthy();
});

it("offers the classic passcheck as a way back", async () => {
  render(<App />);

  expect(
    await screen.findByRole("link", { name: "Zur klassischen Ansicht" })
  ).toHaveAttribute("href", "/passcheck/");
});
