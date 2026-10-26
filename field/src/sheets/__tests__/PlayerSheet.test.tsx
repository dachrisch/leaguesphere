import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import PlayerSheet from "../PlayerSheet";
import type { RosterEntry } from "../../api/types";

function player(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: 12,
    jersey_number: 6,
    first_name: "Jonas",
    last_name: "Brenner",
    pass_number: 10012,
    isSelected: false,
    ...overrides,
  };
}

it("blocks confirmation for a player with an eligibility error", () => {
  render(
    <PlayerSheet
      player={player({ validationError: "Maximum an Spieltagen erreicht." })}
      teamName="Home"
      checkedNumbers={[]}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Maximum an Spieltagen erreicht."
  );
  expect(
    screen.queryByRole("button", { name: "Bestätigen" })
  ).not.toBeInTheDocument();
});

it("allows confirmation when there is only a warning", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();

  render(
    <PlayerSheet
      player={player()}
      teamName="Home"
      checkedNumbers={[]}
      warnings={["Kein Passfoto hinterlegt."]}
      onConfirm={onConfirm}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByText("Kein Passfoto hinterlegt.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Bestätigen" }));

  expect(onConfirm).toHaveBeenCalledWith(6);
});

it("skips jersey numbers that are already checked", async () => {
  const user = userEvent.setup();

  render(
    <PlayerSheet
      player={player({ jersey_number: 6 })}
      teamName="Home"
      checkedNumbers={[6, 7]}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />
  );

  const number = screen.getByRole("spinbutton", { name: "Trikotnummer" });

  expect(number).toHaveValue(6);

  await user.click(screen.getByRole("button", { name: "Nächste Nummer" }));

  expect(number).toHaveValue(8);
});

it("hides the photo until the official taps it", async () => {
  const user = userEvent.setup();

  render(
    <PlayerSheet
      player={player()}
      teamName="Home"
      checkedNumbers={[]}
      photoUrl="blob:photo-12"
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.queryByRole("img")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Foto ansehen" }));

  const image = screen.getByRole("img", { name: "Passfoto von Jonas Brenner" });
  expect(image).toHaveAttribute("src", "blob:photo-12");
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(screen.getByText(/no-store/)).toBeInTheDocument();
});
