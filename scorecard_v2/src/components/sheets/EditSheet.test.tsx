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

  it("corrects the rows that used to have no edit action at all", () => {
    expect(editField("Pass")).toBe("play");
    expect(editField("Pass unvollständig")).toBe("play");
    expect(editField("Run")).toBe("play");
    expect(editField("Sack")).toBe("play");
    expect(editField("Challenge")).toBe("text");
    expect(editField("Turnover")).toBe("text");
    expect(editField("Feldposition")).toBe("fieldpos");
  });

  it("needs no number on any row: the score belongs to the team", () => {
    expect(jerseyRequired()).toBe(false);
    // the same answer for every row
    expect(jerseyRequired()).toBe(false);
    expect(jerseyRequired()).toBe(false);
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

  it("corrects a scoring row without a number", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ event: "Touchdown", jersey: null });

    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({ name: "Touchdown" });
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

describe("correcting the rows without an edit action before", () => {
  it("rewrites a play's yards and keeps the thrower", () => {
    const event = editEvent("Pass", {
      jersey: 7,
      payload: { yards: 8, complete: true, qb: 12 },
      yards: 12,
    });

    expect(event).toEqual({
      name: "Pass",
      player: 7,
      input: "12 Yards · QB #12",
      payload: { yards: 12, complete: true, qb: 12 },
    });
  });

  it("keeps a sack a loss", () => {
    const event = editEvent("Sack", {
      jersey: 9,
      payload: { yards: -7 },
      yards: 3,
    });

    expect(event.payload).toEqual({ yards: -3 });
    expect(event.input).toBe("3 Yards Verlust");
  });

  it("rewrites a challenge's text", () => {
    expect(editEvent("Challenge", { input: "alt", text: "neu" })).toEqual({
      name: "Challenge",
      input: "neu",
    });
  });

  it("rewrites the spot of a Feldposition row", () => {
    const event = editEvent("Feldposition", {
      payload: { ballOn: 12, input: "A12" },
      // the sheet builds this from side B + yard line 12
      spot: 38,
    });

    expect(event).toEqual({
      name: "Feldposition",
      input: "B12",
      payload: { ballOn: 38, input: "B12" },
    });
  });

  it("shows the play's yards and the spot in the sheet", () => {
    renderSheet({ event: "Run", payload: { yards: 8 } });

    expect(screen.getByRole("textbox", { name: "Yards" })).toHaveValue("8");
    expect(screen.getByRole("button", { name: "Gewinn" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("correcting the play's numbers in the sheet", () => {
  it("sends a typed loss and keeps the sign in the payload", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Run",
      payload: { yards: 8 },
    });

    await user.click(screen.getByRole("button", { name: "Verlust" }));
    const yards = screen.getByRole("textbox", { name: "Yards" });
    await user.clear(yards);
    // a typed minus marks the loss too, like the play sheet
    await user.type(yards, "-6");
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run",
      player: 23,
      input: "6 Yards Verlust",
      payload: { yards: -6 },
    });
  });

  it("switches a loss back to a gain", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Run",
      payload: { yards: -4 },
    });

    expect(screen.getByRole("button", { name: "Verlust" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Gewinn" }));
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { yards: 4 } }),
    );
  });

  it("rewrites the text of a challenge", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Challenge",
      input: "Aus",
    });

    const text = screen.getByRole("textbox", { name: /Text/ });
    await user.clear(text);
    await user.type(text, "Einwurf zu früh");
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Challenge",
      input: "Einwurf zu früh",
    });
  });

  it("moves a spot to the other half of the field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Feldposition",
      payload: { ballOn: 12, input: "A12" },
    });

    await user.click(screen.getByRole("button", { name: "B · gegnerische" }));
    const line = screen.getByRole("textbox", { name: /Yardlinie/ });
    await user.clear(line);
    await user.type(line, "20");
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Feldposition",
      input: "B20",
      payload: { ballOn: 30, input: "B20" },
    });
  });

  it("refuses a yard line outside the field", async () => {
    const user = userEvent.setup();
    renderSheet({
      event: "Feldposition",
      payload: { ballOn: 12, input: "A12" },
    });

    const line = screen.getByRole("textbox", { name: /Yardlinie/ });
    await user.clear(line);
    await user.type(line, "40");

    expect(screen.getByRole("alert")).toHaveTextContent(/zwischen 0 und 25/);
    expect(
      screen.getByRole("button", { name: "Änderung speichern" }),
    ).toBeDisabled();
  });

  it("switches back to the own half", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({
      event: "Feldposition",
      payload: { ballOn: 38, input: "B12" },
    });

    await user.click(screen.getByRole("button", { name: "A · eigene" }));
    await user.click(
      screen.getByRole("button", { name: "Änderung speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Feldposition",
      input: "A12",
      payload: { ballOn: 12, input: "A12" },
    });
  });
});
