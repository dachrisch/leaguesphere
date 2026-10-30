import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import { IgnoredWrite } from "./errors";
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
    roster?: RosterPlayer[] | null;
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
      roster={overrides.roster === undefined ? ROSTER : overrides.roster}
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
  return screen.getByRole("button", {
    name: /^(Speichern|Speichern …|Spieler wählen)$/,
  });
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

  it("keeps save disabled until a jersey is picked", async () => {
    renderSheet();

    expect(saveButton()).toHaveTextContent("Spieler wählen");
    expect(saveButton()).toBeDisabled();

    await pick(23);

    expect(saveButton()).toHaveTextContent("Speichern");
    expect(saveButton()).toBeEnabled();
  });

  it("asks nothing about the extra point: the try has not been played yet", () => {
    renderSheet();

    expect(screen.queryByRole("group", { name: "Extrapunkt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+1" })).toBeNull();
  });

  it("sends the touchdown row alone", async () => {
    const { onClose, onSubmit } = renderSheet();

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Touchdown", player: 23 }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers this game's scorers as one-tap chips", async () => {
    const onSubmit = vi.fn<Submit>(async () => undefined);
    render(
      <TouchdownSheet
        onClose={vi.fn()}
        onSubmit={onSubmit}
        recent={[23]}
        roster={ROSTER}
        side="home"
        teamName="Ravens"
      />,
    );
    const user = userEvent.setup();

    const chips = screen.getByRole("group", { name: "Zuletzt" });
    await user.click(
      within(chips).getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    );
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Touchdown", player: 23 }]);
  });

  it("takes a typed number when the roster is empty", async () => {
    const { onSubmit } = renderSheet({ roster: [] });
    const user = userEvent.setup();

    const input = screen.getByRole("textbox", { name: /Trikotnummer/ });
    await user.type(input, "51");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([
      { name: "Touchdown", player: 51 },
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
    expect(saveButton()).toHaveTextContent("Speichern …");
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

  it("cannot be dismissed while the write is in flight", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn<Submit>(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const { onClose } = renderSheet({ onSubmit });
    const user = userEvent.setup();

    await pick(23);
    await user.click(saveButton());

    const dialog = screen.getByRole("dialog");
    await user.keyboard("{Escape}");
    await user.click(dialog.parentElement as HTMLElement);
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(close).toHaveAttribute("aria-disabled", "true");
    await user.click(close);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveSubmit?.();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("submits once for a synchronous double tap", async () => {
    const onSubmit = vi.fn<Submit>(() => new Promise<void>(() => undefined));
    renderSheet({ onSubmit });

    await pick(23);
    const save = saveButton();
    fireEvent.click(save);
    fireEvent.click(save);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("clamps a typed number to two digits and disables save when cleared", () => {
    renderSheet({ roster: [] });
    const input = screen.getByRole("textbox", { name: /Trikotnummer/ });

    fireEvent.change(input, { target: { value: "100" } });
    expect(input).toHaveValue("10");
    expect(saveButton()).toBeEnabled();

    fireEvent.change(input, { target: { value: "" } });
    expect(saveButton()).toBeDisabled();
  });

  it("keeps the picked jersey and the sheet open after a failure", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new ApiError(500, { detail: "Server weg" }, "Server weg");
    });
    renderSheet({ onSubmit });

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Server weg");
    expect(
      screen.getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(saveButton()).toBeEnabled();
  });

  it("shows the guard's reason when the write is not attempted", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new IgnoredWrite("Kein Ballbesitz – bitte Team wählen.");
    });
    renderSheet({ onSubmit });

    await pick(23);
    await userEvent.setup().click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kein Ballbesitz – bitte Team wählen.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("waits for the roster instead of guessing it is empty", () => {
    renderSheet({ roster: null });

    expect(screen.getByText("Kader lädt …")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Trikotnummer/ }),
    ).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("calls the roster bestätigt only after a passed passcheck", () => {
    renderSheet({ passcheck: true });
    expect(screen.getByText("Bestätigter Kader")).toBeInTheDocument();
    expect(screen.getByText("Nur bestätigte Nummern.")).toBeInTheDocument();
  });

  it("calls the roster plain Kader without a passcheck", () => {
    renderSheet();
    expect(screen.getByText("Kader")).toBeInTheDocument();
    expect(screen.queryByText("Bestätigter Kader")).not.toBeInTheDocument();
    expect(screen.queryByText("Nur bestätigte Nummern.")).not.toBeInTheDocument();
  });
});

/** A tackle-sized roster: 30 home players, #1–#30. */
const BIG: RosterPlayer[] = Array.from({ length: 30 }, (_, index) => ({
  side: "home" as const,
  jersey: index + 1,
  name: `Spieler${index + 1}`,
}));

describe("TouchdownSheet with a large roster", () => {
  async function key(digit: string): Promise<void> {
    await userEvent
      .setup()
      .click(
        within(screen.getByRole("group", { name: "Ziffern" })).getByRole("button", {
          name: digit,
        }),
      );
  }

  it("swaps the tile grid for a keypad above 24 players", () => {
    renderSheet({ roster: BIG });

    expect(screen.getByRole("group", { name: "Ziffern" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Trikotnummer 7,/ })).toBeNull();
  });

  it("keeps the grid for a flag-sized roster", () => {
    renderSheet();

    expect(screen.queryByRole("group", { name: "Ziffern" })).toBeNull();
  });

  it("confirms the typed number with the roster name and saves it", async () => {
    const { onSubmit } = renderSheet({ roster: BIG });

    await key("2");
    await key("3");

    expect(screen.getByRole("status", { name: "Trikotnummer" })).toHaveTextContent(
      "23Spieler23",
    );
    await userEvent.setup().click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith([{ name: "Touchdown", player: 23 }]);
  });

  it("deletes the last digit", async () => {
    renderSheet({ roster: BIG });

    await key("2");
    await key("3");
    await key("Löschen");

    expect(screen.getByRole("status", { name: "Trikotnummer" })).toHaveTextContent(
      "2Spieler2",
    );
  });

  it("accepts a number outside the roster without a passcheck, marked", async () => {
    const { onSubmit } = renderSheet({ roster: BIG });

    await key("8");
    await key("8");

    expect(screen.getByRole("status", { name: "Trikotnummer" })).toHaveTextContent(
      "nicht im Kader",
    );
    await userEvent.setup().click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith([{ name: "Touchdown", player: 88 }]);
  });

  it("refuses a number outside a checked roster", async () => {
    renderSheet({ roster: BIG, passcheck: true });

    await key("8");
    await key("8");

    expect(screen.getByRole("status", { name: "Trikotnummer" })).toHaveTextContent(
      "nicht im bestätigten Kader",
    );
    expect(saveButton()).toBeDisabled();
  });
});
