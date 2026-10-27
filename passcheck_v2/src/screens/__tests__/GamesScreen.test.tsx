import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import GamesScreen from "../GamesScreen";
import type { GamesResponse } from "../../api/types";

const response: GamesResponse = {
  officialsTeamName: "Officials",
  gamedays: [{ id: 7, name: "Spieltag 7" }],
  games: [
    {
      gameday_id: 7,
      field: 1,
      scheduled: "10:00:00",
      home: { id: 1, name: "Home", isChecked: true },
      away: { id: 2, name: "Away", isChecked: false },
    },
  ],
};

it("shows the checked state per team and opens a team", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const loadGames = vi.fn().mockResolvedValue(response);

  render(<GamesScreen loadGames={loadGames} onOpen={onOpen} />);

  expect(await screen.findByText("geprüft")).toBeInTheDocument();
  expect(screen.getByText("offen")).toBeInTheDocument();
  expect(screen.getByText("10:00 Uhr")).toBeInTheDocument();
  expect(screen.getByText("Feld 1")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Home/ }));

  expect(onOpen).toHaveBeenCalledWith(1, 7);
});

it("shows an empty state when the team has no games today", async () => {
  const loadGames = vi.fn().mockResolvedValue({
    officialsTeamName: "Officials",
    gamedays: [],
    games: [],
  });

  render(<GamesScreen loadGames={loadGames} onOpen={vi.fn()} />);

  expect(
    await screen.findByText("Heute keine Spiele für den Passcheck.")
  ).toBeInTheDocument();
});

it("links back to the classic passcheck", async () => {
  const loadGames = vi.fn().mockResolvedValue(response);

  render(<GamesScreen loadGames={loadGames} onOpen={vi.fn()} />);

  expect(
    await screen.findByRole("link", { name: "Zur klassischen Ansicht" })
  ).toHaveAttribute("href", "/passcheck/");
});

it("shows the API error when games cannot be loaded", async () => {
  const loadGames = vi
    .fn()
    .mockRejectedValue({ message: "Ihr spielt heute nicht." });

  render(<GamesScreen loadGames={loadGames} onOpen={vi.fn()} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Ihr spielt heute nicht."
  );
});
