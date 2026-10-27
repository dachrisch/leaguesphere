import { fireEvent, render, screen } from "@testing-library/react";
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
