import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import TouchdownSheet from "./TouchdownSheet";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

type Submit = (events: GameLogEventInput[]) => Promise<void>;

function renderSheet(
  overrides: {
    side?: RosterPlayer["side"];
    roster?: RosterPlayer[];
    passcheck?: boolean;
    onSubmit?: Submit;
  } = {},
) {
  const onSubmit = overrides.onSubmit ?? vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <TouchdownSheet
      onClose={onClose}
      onSubmit={onSubmit}
      passcheck={overrides.passcheck ?? false}
      roster={overrides.roster ?? ROSTER}
      side={overrides.side ?? "home"}
      teamName="Ravens"
    />,
  );
  return { onClose, onSubmit };
}

async function pick(jersey: number): Promise<void> {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: new RegExp(`^Trikotnummer ${jersey}`) }));
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /^(Speichern|Speichert …|Spieler wählen)$/ });
}

describe("TouchdownSheet", () => {
  it("asks who scored and offers only the possession team's roster", () => {
    renderSheet();

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Wer hat gepunktet?",
    );
    expect(
      screen.getByRole("button", { name: "Trikotnummer 7, Meier" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Wolf/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps save and the conversion disabled until a jersey is picked", async () => {
    renderSheet();

    expect(saveButton()).toHaveTextContent("Spieler wählen");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "+1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+0" })).toBeDisabled();

    await pick(23);

    expect(saveButton()).toHaveTextContent("Speichern");
    expect(saveButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "+1" })).toBeEnabled();
  });

  it("sends the touchdown with a one-point conversion by default", async () => {
    const { onClose, onSubmit } = renderSheet();

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Touchdown", player: 23 },
      { name: "1-Extra-Punkt", player: 23 },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends two points with the touchdown's jersey", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await pick(23);
    await user.click(screen.getByRole("button", { name: "+2" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Touchdown", player: 23 },
      { name: "2-Extra-Punkte", player: 23 },
    ]);
  });

  it("sends only the touchdown row for no conversion", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await pick(7);
    await user.click(screen.getByRole("button", { name: "+0" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Touchdown", player: 7 },
    ]);
  });

  it("takes a typed number when the roster is empty", async () => {
    const { onSubmit } = renderSheet({ roster: [] });
    const user = userEvent.setup();

    const input = screen.getByRole("textbox", { name: /Trikotnummer/ });
    await user.type(input, "51");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Touchdown", player: 51 },
      { name: "1-Extra-Punkt", player: 51 },
    ]);
  });

  it("keeps the sheet open and shows the server detail when the write fails", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new ApiError(
        400,
        { detail: "Dieses Spiel ist bereits beendet." },
        "Dieses Spiel ist bereits beendet.",
      );
    });
    renderSheet({ onSubmit });

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Dieses Spiel ist bereits beendet.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent("Speichern");
  });

  it("disables the sheet while the request is in flight", async () => {
    const onSubmit = vi.fn<Submit>(() => new Promise<void>(() => undefined));
    renderSheet({ onSubmit });

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Speichert …");
    expect(screen.getByRole("button", { name: "+1" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Trikotnummer 7, Meier" }),
    ).toBeDisabled();
  });

  it("falls back to a German message when the failure carries no detail", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new Error("offline");
    });
    renderSheet({ onSubmit });

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Touchdown konnte nicht gespeichert werden. Bitte erneut versuchen.",
    );
  });

  it("calls the roster bestätigt only after a passed passcheck", () => {
    renderSheet({ passcheck: true });
    expect(screen.getByText("Bestätigter Kader")).toBeInTheDocument();
  });

  it("calls the roster plain Kader without a passcheck", () => {
    renderSheet();
    expect(screen.getByText("Kader")).toBeInTheDocument();
    expect(screen.queryByText("Bestätigter Kader")).not.toBeInTheDocument();
  });
});
