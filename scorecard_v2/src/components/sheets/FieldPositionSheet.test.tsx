import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FieldPositionSheet, { fieldPositionEvent } from "./FieldPositionSheet";

function renderSheet(
  overrides: Partial<Parameters<typeof FieldPositionSheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <FieldPositionSheet
      ballOn={null}
      onClose={onClose}
      onSubmit={onSubmit}
      teamName="Ravens"
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("fieldPositionEvent", () => {
  it("stores the A half as the machine value", () => {
    expect(fieldPositionEvent("A", 12)).toEqual({
      name: "Feldposition",
      input: "A12",
      payload: { ballOn: 12, input: "A12" },
    });
  });

  it("mirrors the B half", () => {
    expect(fieldPositionEvent("B", 20)).toEqual({
      name: "Feldposition",
      input: "B20",
      payload: { ballOn: 30, input: "B20" },
    });
  });
});

describe("FieldPositionSheet", () => {
  it("saves A5 with one tap before a spot was set", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet();

    await user.click(
      screen.getByRole("button", { name: "Feldposition speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Feldposition",
      input: "A5",
      payload: { ballOn: 5, input: "A5" },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prefills the current spot on the B half", () => {
    renderSheet({ ballOn: 30 });

    expect(screen.getByRole("button", { name: /B ·/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Yardlinie (0–25)" })).toHaveValue(
      "20",
    );
  });

  it("prefills the current spot on the A half", () => {
    renderSheet({ ballOn: 12 });

    expect(screen.getByRole("button", { name: /A ·/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Yardlinie (0–25)" })).toHaveValue(
      "12",
    );
  });

  it("refuses a yard line beyond the 25", async () => {
    const user = userEvent.setup();
    renderSheet();

    const yards = screen.getByRole("textbox", { name: "Yardlinie (0–25)" });
    await user.clear(yards);
    await user.type(yards, "30");

    expect(
      screen.getByRole("button", { name: "Feldposition speichern" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Yardlinie liegt zwischen 0 und 25.",
    );
  });

  it("keeps the sheet open with the reason when the write fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("kaputt");
    });
    renderSheet({ onSubmit });

    await user.click(
      screen.getByRole("button", { name: "Feldposition speichern" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Feldposition konnte nicht gespeichert werden",
    );
  });
});
