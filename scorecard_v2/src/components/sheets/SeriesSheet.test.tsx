import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import SeriesSheet, { type SeriesMode } from "./SeriesSheet";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

type Submit = (events: GameLogEventInput[]) => Promise<void>;

function renderSheet(mode: SeriesMode, onSubmit?: Submit, roster = ROSTER) {
  const submit = onSubmit ?? vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <SeriesSheet
      mode={mode}
      onClose={onClose}
      onSubmit={submit}
      roster={roster}
      side="home"
      teamName="Ravens"
    />,
  );
  return { onClose, onSubmit: submit };
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /^(Speichern|Speichert …)$/ });
}

describe("SeriesSheet", () => {
  it("records a first down with a jersey", async () => {
    const { onSubmit } = renderSheet("first");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "First Down", player: 23 },
    ]);
  });

  it("records a first down without a jersey", async () => {
    const { onSubmit } = renderSheet("first");

    await userEvent.setup().click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "First Down" }]);
  });

  it("records a turnover without a player", async () => {
    const { onSubmit } = renderSheet("turnover");

    expect(
      screen.queryByRole("group", { name: "Trikotnummer (optional)" }),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Turnover" }]);
  });

  it("records an interception for the possessing team", async () => {
    const { onSubmit } = renderSheet("interception");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Interception", player: 7 },
    ]);
  });

  it("records an interception without a jersey", async () => {
    const { onSubmit } = renderSheet("interception");

    await userEvent.setup().click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Interception" }]);
  });

  it("records the remaining Spielzeit as mm:ss", async () => {
    const { onSubmit } = renderSheet("time");
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "12");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "34");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Spielzeit", input: "12:34" },
    ]);
  });

  it("pads a short Spielzeit to mm:ss", async () => {
    const { onSubmit } = renderSheet("time");
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "4");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Spielzeit", input: "05:04" },
    ]);
    expect(screen.getByText(/Restliche Spielzeit/)).toBeInTheDocument();
  });

  it("records an Auszeit as m:ss", async () => {
    const { onSubmit } = renderSheet("timeout");
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "3");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "5");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Auszeit", input: "3:05" }]);
  });

  it("rejects seconds above 59", async () => {
    renderSheet("time");
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "12");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "60");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sekunden müssen zwischen 0 und 59 liegen.",
    );
    expect(saveButton()).toBeDisabled();
  });

  it("refuses a time with empty minutes", async () => {
    renderSheet("time");

    await userEvent
      .setup()
      .type(screen.getByRole("textbox", { name: "Sekunden" }), "5");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bitte Minuten angeben.",
    );
    expect(saveButton()).toBeDisabled();
  });

  it("rejects a Spielzeit above 59 minutes", async () => {
    renderSheet("time");
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "60");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "00");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Spielzeit muss zwischen 00:00 und 59:59 liegen.",
    );
  });

  it("disables the sheet while the request is in flight", async () => {
    const onSubmit = vi.fn<Submit>(() => new Promise<void>(() => undefined));
    renderSheet("first", onSubmit);

    await userEvent.setup().click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Speichert …");
  });

  it("omits the jersey picker when the roster is empty", () => {
    renderSheet("interception", undefined, []);

    expect(
      screen.queryByRole("group", { name: "Trikotnummer (optional)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Kein Kader geladen/),
    ).toBeInTheDocument();
  });
});
