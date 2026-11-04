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
  it("stores the own side as the machine value", () => {
    expect(fieldPositionEvent("own", 35)).toEqual({
      name: "Feldposition",
      input: "eigene 35",
      payload: { ballOn: 35, input: "eigene 35" },
    });
  });

  it("mirrors the opponent's side", () => {
    expect(fieldPositionEvent("opponent", 40)).toEqual({
      name: "Feldposition",
      input: "gegn. 40",
      payload: { ballOn: 60, input: "gegn. 40" },
    });
  });
});

describe("FieldPositionSheet", () => {
  it("saves the own 35 with one tap", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet();

    await user.click(
      screen.getByRole("button", { name: "Feldposition speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Feldposition",
      input: "eigene 35",
      payload: { ballOn: 35, input: "eigene 35" },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prefills the current spot on the right half", () => {
    renderSheet({ ballOn: 60 });

    expect(
      screen.getByRole("button", { name: "gegnerische" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Yardlinie (0–50)" })).toHaveValue(
      "40",
    );
  });

  it("refuses a yard line beyond the 50", async () => {
    const user = userEvent.setup();
    renderSheet();

    const yards = screen.getByRole("textbox", { name: "Yardlinie (0–50)" });
    await user.clear(yards);
    await user.type(yards, "55");

    expect(
      screen.getByRole("button", { name: "Feldposition speichern" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Yardlinie liegt zwischen 0 und 50.",
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
