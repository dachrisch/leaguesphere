import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import RosterScreen from "../RosterScreen";
import type {
  RosterEntry,
  RosterResponse,
  RosterWriteEntry,
} from "../../api/types";

function player(id: number, overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id,
    jersey_number: id,
    first_name: "Jonas",
    last_name: `Brenner${id}`,
    pass_number: 1000 + id,
    isSelected: false,
    ...overrides,
  };
}

function makeRoster(players: RosterEntry[]): RosterResponse {
  return {
    is_user_or_staff: false,
    all_leagues: [],
    team_id: 1,
    related_teams: [],
    years: [2026],
    official_name: "",
    note: null,
    team: {
      name: "Home",
      roster: players,
      validator: { minimum_player_strength: 11 },
    },
    additionalTeams: [],
  };
}

function Harness({
  roster,
  onOpenPlayer,
  onFinalize,
}: {
  roster: RosterResponse;
  onOpenPlayer: (player: RosterEntry) => void;
  onFinalize?: (entries: RosterWriteEntry[]) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const toggle = (entry: RosterEntry) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  };
  return (
    <RosterScreen
      roster={roster}
      checkedIds={checked}
      onToggle={toggle}
      onOpenPlayer={onOpenPlayer}
      onFinalize={onFinalize}
    />
  );
}

const fourteen = Array.from({ length: 14 }, (_, index) => player(index + 1));

it("checks a player with one tap and undoes it", async () => {
  const user = userEvent.setup();
  render(<Harness roster={makeRoster(fourteen)} onOpenPlayer={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Jonas Brenner1" }));

  expect(screen.getByText(/1 von 14/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Rückgängig/ }));

  expect(screen.getByText(/0 von 14/)).toBeInTheDocument();
});

it("opens the record instead of checking a blocked player", async () => {
  const user = userEvent.setup();
  const onOpenPlayer = vi.fn();
  const players = fourteen.map((entry, index) =>
    index === 0 ? { ...entry, validationError: "Nicht spielberechtigt." } : entry
  );

  render(
    <Harness roster={makeRoster(players)} onOpenPlayer={onOpenPlayer} />
  );

  await user.click(screen.getByRole("button", { name: "Jonas Brenner1" }));

  expect(onOpenPlayer).toHaveBeenCalledWith(players[0]);
  expect(screen.getByText(/0 von 14/)).toBeInTheDocument();
});

it("opens the record from the jersey chip without toggling", async () => {
  const user = userEvent.setup();
  const onOpenPlayer = vi.fn();

  render(
    <Harness roster={makeRoster(fourteen)} onOpenPlayer={onOpenPlayer} />
  );

  await user.click(
    screen.getByRole("button", {
      name: "Trikotnummer von Jonas Brenner1 ändern",
    })
  );

  expect(onOpenPlayer).toHaveBeenCalledWith(fourteen[0]);
  expect(screen.getByText(/0 von 14/)).toBeInTheDocument();
});

it("shows the average seconds per player once the session has started", async () => {
  const user = userEvent.setup();

  render(<Harness roster={makeRoster(fourteen)} onOpenPlayer={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Jonas Brenner1" }));
  await user.click(screen.getByRole("button", { name: "Jonas Brenner2" }));

  expect(screen.getByText(/Ø \d+([.,]\d+)? s\/Spieler/)).toBeInTheDocument();
});

it("hands the checked roster to finalize", async () => {
  const user = userEvent.setup();
  const onFinalize = vi.fn();

  render(
    <Harness
      roster={makeRoster(fourteen)}
      onOpenPlayer={vi.fn()}
      onFinalize={onFinalize}
    />
  );

  await user.click(screen.getByRole("button", { name: "Jonas Brenner1" }));
  await user.click(screen.getByRole("button", { name: "Jonas Brenner2" }));
  await user.click(
    screen.getByRole("button", { name: "Prüfung abschließen" })
  );

  expect(onFinalize).toHaveBeenCalledWith([
    { id: 1, jersey_number: 1 },
    { id: 2, jersey_number: 2 },
  ]);
});
