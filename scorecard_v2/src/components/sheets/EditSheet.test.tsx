import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../../api/types";
import EditSheet, {
  editEvent,
  editField,
  jerseyRequired,
  parseClock,
} from "./EditSheet";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

function renderSheet(
  overrides: Partial<Parameters<typeof EditSheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <EditSheet
      event="Touchdown"
      half={1}
      input={null}
      jersey={23}
      onClose={onClose}
      onSubmit={onSubmit}
      roster={ROSTER}
      side="home"
      teamName="Ravens"
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("EditSheet helpers", () => {
  it("knows which rows are corrected by a jersey and which by a clock", () => {
    expect(editField("Touchdown")).toBe("jersey");
    expect(editField("First Down")).toBe("jersey");
    expect(editField("Spielzeit")).toBe("clock");
    expect(editField("Auszeit")).toBe("clock");
  });

  it("requires a number on the rows that only score with one", () => {
    expect(jerseyRequired("Touchdown")).toBe(true);
    expect(jerseyRequired("1-Extra-Punkt")).toBe(true);
    expect(jerseyRequired("First Down")).toBe(false);
  });

  it("reads a stored clock in both old and new widths", () => {
    expect(parseClock("08:12")).toEqual(["08", "12"]);
    expect(parseClock("1:30")).toEqual(["1", "30"]);
    expect(parseClock(null)).toEqual(["", ""]);
    expect(parseClock("kaputt")).toEqual(["", ""]);
  });

  it("builds the corrected event and keeps the row's own name", () => {
    expect(editEvent("Touchdown", { jersey: 42 })).toEqual({
      name: "Touchdown",
      player: 42,
    });
    expect(editEvent("Auszeit", { minutes: "3", seconds: "5" })).toEqual({
      name: "Auszeit",
      input: "03:05",
    });
    expect(
      editEvent("Strafe", { jersey: 9, input: "Holding Defense" }),
    ).toEqual({ name: "Strafe", player: 9, input: "Holding Defense" });
  });
});

describe("EditSheet", () => {
  it("states the row's team and half", () => {
    renderSheet({ event: "Auszeit", half: 2, input: "03:05" });

    expect(screen.getByText("Ravens · 2. Halbzeit")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Minuten" })).toHaveValue(
      "03",
    );
    expect(screen.getByRole("textbox", { name: "Sekunden" })).toHaveValue(
      "05",
    );
  });

  it("saves the corrected clock", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet({
      event: "Auszeit",
      input: "03:05",
    });

    const minutes = screen.getByRole("textbox", { name: "Minuten" });
    await user.clear(minutes);
    await user.type(minutes, "7");
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Auszeit",
      input: "07:05",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves the corrected jersey of a scoring row", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ event: "Touchdown", jersey: 23 });

    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Touchdown",
      player: 7,
    });
  });

  it("refuses a scoring row without a number", () => {
    renderSheet({ event: "Touchdown", jersey: null });

    expect(
      screen.getByRole("button", { name: "Änderung speichern" }),
    ).toBeDisabled();
  });

  it("keeps the penalty text when its number is corrected", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Strafe",
      input: "Holding Defense",
      jersey: 9,
    });

    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Strafe",
      player: 7,
      input: "Holding Defense",
    });
  });
});

describe("EditSheet edge cases", () => {
  it("cannot change a number while no roster is loaded", () => {
    renderSheet({ event: "Touchdown", roster: null });

    expect(
      screen.getByText("Kein Kader geladen – die Nummer kann nicht geändert werden."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Trikot/ }),
    ).toBeNull();
  });

  it("lets an entry that may name nobody stay without a number", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "First Down",
      jersey: null,
    });

    expect(
      screen.getByRole("button", { name: "Ohne Nummer" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({ name: "First Down" });
  });

  it("keeps the sheet open with the reason when the correction fails", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("kaputt");
    });
    render(
      <EditSheet
        event="Touchdown"
        half={1}
        input={null}
        jersey={23}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        roster={ROSTER}
        side="home"
        teamName="Ravens"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Änderung konnte nicht gespeichert werden",
    );
  });

  it("refuses a clock correction with an empty field", () => {
    renderSheet({ event: "Spielzeit", input: "08:12" });

    fireEvent.change(screen.getByRole("textbox", { name: "Sekunden" }), {
      target: { value: "" },
    });

    expect(
      screen.getByRole("button", { name: "Änderung speichern" }),
    ).toBeDisabled();
  });
});
