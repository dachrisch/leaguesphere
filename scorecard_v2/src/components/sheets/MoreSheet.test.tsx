import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import MoreSheet, { moreEvent, moreSummary, moreTeam, type MoreMode } from "./MoreSheet";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

type Submit = (events: GameLogEventInput[], team: string) => Promise<void>;

function renderSheet(
  mode: MoreMode,
  onSubmit?: Submit,
  roster: RosterPlayer[] | null = ROSTER,
) {
  const submit = onSubmit ?? vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <MoreSheet
      mode={mode}
      onClose={onClose}
      onSubmit={submit}
      opponentName="Wolves"
      roster={roster}
      side="home"
      teamName="Ravens"
    />,
  );
  return { onClose, onSubmit: submit };
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", {
    name: /^(Speichern|Speichern …|Spieler wählen)$/,
  });
}

describe("MoreSheet helpers", () => {
  it("records a safety for the opponent and an overtime for the possession", () => {
    expect(moreTeam("safety", "Ravens", "Wolves")).toBe("Wolves");
    expect(moreTeam("overtime", "Ravens", "Wolves")).toBe("Ravens");
  });

  it("writes the exact wire names", () => {
    expect(moreEvent("safety", 11, 1)).toEqual({
      name: "Safety (+1)",
      player: 11,
    });
    expect(moreEvent("safety", 11, 2)).toEqual({
      name: "Safety (+2)",
      player: 11,
    });
    expect(moreEvent("overtime", 7, 2)).toEqual({
      name: "Overtime",
      player: 7,
    });
  });

  it("names the points and the team they land on", () => {
    expect(moreSummary("safety", 11, 2, "Wolves")).toBe(
      "Safety · 2 Punkte für Wolves",
    );
    expect(moreSummary("safety", 11, 1, "Wolves")).toBe(
      "Safety · 1 Punkt für Wolves",
    );
    expect(moreSummary("overtime", 7, 2, "Ravens")).toBe("Overtime #7");
    expect(moreSummary("safety", null, 2, "Wolves")).toMatch(/Spieler wählen/);
  });
});

describe("MoreSheet safety", () => {
  it("offers the opponent's roster and sends two points by default", async () => {
    const { onSubmit } = renderSheet("safety");
    const user = userEvent.setup();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Safety");
    expect(
      screen.queryByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Trikotnummer 11, Wolf" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Safety (+2)", player: 11 }],
      "Wolves",
    );
  });

  it("records one point when the official picks +1", async () => {
    const { onSubmit } = renderSheet("safety");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikotnummer 11, Wolf" }));
    await user.click(screen.getByRole("button", { name: "+1" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Safety (+1)", player: 11 }],
      "Wolves",
    );
  });

  it("shows the points and the team that receives them", async () => {
    renderSheet("safety");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikotnummer 11, Wolf" }));

    expect(screen.getByText("Safety · 2 Punkte für Wolves")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+1" }));
    expect(screen.getByText("Safety · 1 Punkt für Wolves")).toBeInTheDocument();
  });

  it("requires a jersey", async () => {
    const { onSubmit } = renderSheet("safety");

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Spieler wählen");
    await userEvent.setup().click(saveButton());

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("MoreSheet overtime", () => {
  it("records an overtime touchdown for the possession team", async () => {
    const { onSubmit } = renderSheet("overtime");
    const user = userEvent.setup();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Overtime");
    expect(
      screen.queryByRole("button", { name: "Trikotnummer 11, Wolf" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+2" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trikotnummer 7, Meier" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Overtime", player: 7 }], "Ravens");
  });

  it("requires a jersey", () => {
    renderSheet("overtime");

    expect(saveButton()).toBeDisabled();
  });

  it("falls back to a typed number when the roster is empty", async () => {
    const { onSubmit } = renderSheet("overtime", undefined, []);
    const user = userEvent.setup();

    await user.type(
      screen.getByRole("textbox", { name: /Trikotnummer/ }),
      "51",
    );
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith([{ name: "Overtime", player: 51 }], "Ravens");
  });

  it("waits for the roster instead of offering the fallback too early", () => {
    renderSheet("overtime", undefined, null);

    expect(screen.getByText("Kader lädt …")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /Trikotnummer/ }),
    ).not.toBeInTheDocument();
  });
});

describe("MoreSheet failure", () => {
  it("keeps the sheet open with the server detail", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new ApiError(409, { detail: "Gerät gesperrt." }, "Gerät gesperrt.");
    });
    renderSheet("safety", onSubmit);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikotnummer 11, Wolf" }));
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Gerät gesperrt.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the sheet while the write is in flight", async () => {
    const onSubmit = vi.fn<Submit>(() => new Promise<void>(() => undefined));
    renderSheet("overtime", onSubmit);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Trikotnummer 7, Meier" }));
    await user.click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Speichern …");
    expect(
      screen.getByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toBeDisabled();
  });
});
