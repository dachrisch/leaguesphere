import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../api/types";
import JerseyPicker, { jerseyDigits, jerseyOptions } from "./JerseyPicker";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Doppelt" },
  { side: "home", jersey: 42, name: null },
];

/** Controlled wrapper: the number field only works with a live `value`. */
function Harness({
  players,
  initial = null,
  onChange = vi.fn(),
}: {
  players: RosterPlayer[];
  initial?: number | null;
  onChange?: (jersey: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <JerseyPicker
      onChange={(jersey) => {
        setValue(jersey);
        onChange(jersey);
      }}
      players={players}
      value={value}
    />
  );
}

describe("JerseyPicker", () => {
  it("shows one button per jersey, sorted, with the surname", () => {
    render(
      <JerseyPicker onChange={vi.fn()} players={ROSTER} value={null} />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "7Meier",
      "23Schulz",
      "42",
    ]);
    expect(
      screen.getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the picked jersey and marks it pressed", async () => {
    const onChange = vi.fn();
    render(<JerseyPicker onChange={onChange} players={ROSTER} value={23} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Trikotnummer 7, Meier" }));

    expect(onChange).toHaveBeenCalledWith(7);
    expect(
      screen.getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to a number field when there is no roster", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} players={[]} />);

    const input = screen.getByRole("textbox", { name: /Trikotnummer/ });
    await userEvent.setup().type(input, "51");

    expect(onChange).toHaveBeenLastCalledWith(51);
    expect(input).toHaveValue("51");
  });

  it("accepts digits only and clears to null", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} players={[]} />);

    const input = screen.getByRole("textbox", { name: /Trikotnummer/ });
    fireEvent.change(input, { target: { value: "1a2" } });
    expect(onChange).toHaveBeenLastCalledWith(12);

    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("disables the grid while disabled", () => {
    render(
      <JerseyPicker
        disabled
        onChange={vi.fn()}
        players={ROSTER}
        value={null}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("leads with the optional no-number tile and clears the choice with it", async () => {
    const onChange = vi.fn();
    render(
      <JerseyPicker
        onChange={onChange}
        optionalLabel="Ohne Nummer"
        players={ROSTER}
        value={7}
      />,
    );

    const none = screen.getByRole("button", { name: "Ohne Nummer" });
    expect(screen.getAllByRole("button")[0]).toBe(none);
    expect(none).toHaveAttribute("aria-pressed", "false");

    await userEvent.setup().click(none);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("marks the optional tile pressed while no number is picked", () => {
    render(
      <JerseyPicker
        onChange={vi.fn()}
        optionalLabel="Ganzes Team"
        players={ROSTER}
        value={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Ganzes Team" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("names the group separately from the button prefix", () => {
    render(
      <JerseyPicker
        groupLabel="Trikotnummer (optional)"
        label="Trikot"
        onChange={vi.fn()}
        players={ROSTER}
        value={null}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Trikotnummer (optional)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trikot 23, Schulz" }),
    ).toBeInTheDocument();
  });

  it("renders the compact variant as one wrapping row of the same tiles", () => {
    render(
      <JerseyPicker
        compact
        onChange={vi.fn()}
        players={ROSTER}
        value={23}
      />,
    );

    const row = screen.getByRole("group", { name: "Trikotnummer" });
    expect(row).toHaveClass("choicerow");
    expect(
      within(row).getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the optional choice in keypad mode too", async () => {
    const big: RosterPlayer[] = Array.from({ length: 30 }, (_, index) => ({
      side: "home" as const,
      jersey: index + 1,
      name: `Spieler${index + 1}`,
    }));
    const onChange = vi.fn();
    render(
      <JerseyPicker
        onChange={onChange}
        optionalLabel="Ohne Nummer"
        players={big}
        value={12}
      />,
    );

    const none = screen.getByRole("button", { name: "Ohne Nummer" });
    expect(none).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(none);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("jerseyOptions", () => {
  it("keeps the first row of a duplicated number", () => {
    expect(jerseyOptions(ROSTER)).toEqual([
      { jersey: 7, name: "Meier" },
      { jersey: 23, name: "Schulz" },
      { jersey: 42, name: null },
    ]);
  });

  it("strips anything that is not a jersey digit", () => {
    expect(jerseyDigits("5a1")).toBe("51");
    expect(jerseyDigits("123")).toBe("12");
    expect(jerseyDigits("")).toBe("");
  });
});
