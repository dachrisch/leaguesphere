import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet } from "../../api/client";
import type { GameLogEventInput, Penalty, RosterPlayer } from "../../api/types";
import PenaltySheet, {
  filterPenalties,
  PENALTY_PAGE,
  penaltyEvent,
  penaltyTeam,
} from "./PenaltySheet";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiGet: vi.fn() };
});

const apiGetMock = apiGet as unknown as Mock;

/**
 * The real catalogue has ~50 entries. The generated names keep the count and
 * the flags honest — every even index is a defense penalty.
 */
const PENALTIES: Penalty[] = Array.from({ length: 50 }, (_, index) => ({
  name: `Strafe ${String(index + 1).padStart(2, "0")}`,
  subtext: `${5 * (index + 1)} Yards`,
  isPenaltyAgainstOpponent: index % 2 === 0,
}));

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

type Submit = (events: GameLogEventInput[], team: string) => Promise<void>;

interface RenderOptions {
  onSubmit?: Submit;
  roster?: RosterPlayer[] | null;
  penalties?: Penalty[];
}

function renderSheet(options: RenderOptions = {}) {
  const submit = options.onSubmit ?? vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <PenaltySheet
      onClose={onClose}
      onSubmit={submit}
      opponentName="Wolves"
      roster={"roster" in options ? (options.roster ?? null) : ROSTER}
      side="home"
      teamName="Ravens"
    />,
  );
  return { onClose, onSubmit: submit };
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", {
    name: /^(Speichern|Speichern …|Strafe wählen|Team wählen)$/,
  });
}

function penaltyList(): HTMLElement {
  return screen.getByRole("group", { name: "Strafen" });
}

/** The penalty buttons only — not the "show all" control inside the group. */
function penaltyButtons(): HTMLElement[] {
  return within(penaltyList()).getAllByRole("button", { name: /^Strafe \d/ });
}

function teamButton(name: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Gegen wen?" })).getByRole(
    "button",
    { name },
  );
}

beforeEach(() => {
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue(PENALTIES);
});

describe("PenaltySheet helpers", () => {
  it("filters case-insensitively on a substring", () => {
    const list = filterPenalties(PENALTIES, "STRAFE 1").map(
      (penalty) => penalty.name,
    );
    expect(list).toContain("Strafe 10");
    expect(list).toContain("Strafe 19");
    expect(list).not.toContain("Strafe 01");
    expect(list).toHaveLength(10);
    expect(filterPenalties(PENALTIES, "YARDS")).toHaveLength(0);
    expect(filterPenalties(PENALTIES, "  ")).toHaveLength(50);
  });

  it("defaults the team from the flag and leaves the choice open", () => {
    const defense = PENALTIES[0];
    const offense = PENALTIES[1];
    expect(penaltyTeam(defense, "Ravens", "Wolves")).toBe("Wolves");
    expect(penaltyTeam(offense, "Ravens", "Wolves")).toBe("Ravens");
    expect(penaltyTeam(null, "Ravens", "Wolves")).toBeNull();
  });

  it("sends the penalty as input with an optional player", () => {
    expect(penaltyEvent("Fehlstart", null)).toEqual({
      name: "Strafe",
      input: "Fehlstart",
    });
    expect(penaltyEvent("Fehlstart", 23)).toEqual({
      name: "Strafe",
      player: 23,
      input: "Fehlstart",
    });
  });
});

describe("PenaltySheet", () => {
  it("loads the catalogue from the config endpoint", async () => {
    renderSheet();

    await screen.findByRole("group", { name: "Strafen" });
    expect(apiGetMock).toHaveBeenCalledWith("/api/config/scorecard/penalties");
  });

  it("shows the first five of the fifty penalties and expands on request", async () => {
    renderSheet();
    const user = userEvent.setup();

    await screen.findByRole("group", { name: "Strafen" });
    expect(penaltyButtons()).toHaveLength(PENALTY_PAGE);

    await user.click(
      screen.getByRole("button", { name: "Alle 50 Strafen anzeigen" }),
    );

    expect(penaltyButtons()).toHaveLength(50);
    expect(
      screen.queryByRole("button", { name: /Strafen anzeigen/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the yardage next to each penalty", async () => {
    renderSheet();

    const first = await screen.findByRole("button", { name: /^Strafe 01/ });
    expect(first).toHaveTextContent("5 Yards");
  });

  it("searches the catalogue and only offers the matches", async () => {
    renderSheet();
    const user = userEvent.setup();

    await screen.findByRole("group", { name: "Strafen" });
    await user.type(screen.getByRole("searchbox", { name: "Strafe suchen" }), "05");

    expect(penaltyButtons()).toHaveLength(1);
    expect(penaltyButtons()[0]).toHaveTextContent("Strafe 05");
    expect(
      screen.queryByRole("button", { name: /Strafen anzeigen/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the expanded list again for a broad search", async () => {
    renderSheet();
    const user = userEvent.setup();

    await screen.findByRole("group", { name: "Strafen" });
    await user.type(screen.getByRole("searchbox", { name: "Strafe suchen" }), "strafe 1");

    expect(penaltyButtons()).toHaveLength(PENALTY_PAGE);
    expect(
      screen.getByRole("button", { name: "Alle 10 Strafen anzeigen" }),
    ).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    renderSheet();

    await userEvent
      .setup()
      .type(screen.getByRole("searchbox", { name: "Strafe suchen" }), "xyz");

    expect(screen.getByText("Keine Strafe gefunden.")).toBeInTheDocument();
  });

  it("defaults to the opponent for a defense penalty", async () => {
    renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 01/ }));

    expect(teamButton("Wolves")).toHaveAttribute("aria-pressed", "true");
    expect(teamButton("Ravens")).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults to the possessing team for an offense penalty", async () => {
    renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));

    expect(teamButton("Ravens")).toHaveAttribute("aria-pressed", "true");
    expect(teamButton("Wolves")).toHaveAttribute("aria-pressed", "false");
  });

  it("lets the official override the default team", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 01/ }));
    await user.click(teamButton("Ravens"));
    await user.click(saveButton());

    expect(teamButton("Ravens")).toHaveAttribute("aria-pressed", "true");
    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", input: "Strafe 01" }],
      "Ravens",
    );
  });

  it("keeps an override when another penalty is picked", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 01/ }));
    await user.click(teamButton("Ravens"));
    await user.click(screen.getByRole("button", { name: /^Strafe 02/ }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", input: "Strafe 02" }],
      "Ravens",
    );
  });

  it("defaults the player to the whole team", async () => {
    renderSheet();

    expect(
      within(
        screen.getByRole("group", { name: "Trikotnummer (optional)" }),
      ).getByRole("button", { name: "Ganzes Team" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the jersey of the team the penalty is charged to", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 01/ }));
    // Wolves are the charged team, so only their roster is offered.
    expect(
      screen.queryByRole("button", { name: /Trikot 23/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Trikot 11, Wolf" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", player: 11, input: "Strafe 01" }],
      "Wolves",
    );
  });

  it("drops a jersey that belongs to the other team after switching", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 01/ }));
    await user.click(screen.getByRole("button", { name: "Trikot 11, Wolf" }));
    await user.click(teamButton("Ravens"));

    expect(
      screen.getByRole("button", { name: "Ganzes Team" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", input: "Strafe 01" }],
      "Ravens",
    );
  });

  it("disables save until a penalty is picked", async () => {
    renderSheet();

    await screen.findByRole("group", { name: "Strafen" });
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Strafe wählen");
  });

  it("keeps the sheet open with the server detail when the write fails", async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new ApiError(409, { detail: "Gerät gesperrt." }, "Gerät gesperrt.");
    });
    renderSheet({ onSubmit });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gerät gesperrt.",
    );
  });

  it("disables the sheet while the write is in flight", async () => {
    const onSubmit = vi.fn<Submit>(() => new Promise<void>(() => undefined));
    renderSheet({ onSubmit });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    await user.click(saveButton());

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Speichern …");
  });

  it("waits for the catalogue instead of claiming there are none", () => {
    apiGetMock.mockReturnValue(new Promise(() => undefined));
    renderSheet();

    expect(screen.getByText("Strafen laden …")).toBeInTheDocument();
  });

  it("shows the load failure instead of an empty list", async () => {
    apiGetMock.mockRejectedValue(
      new ApiError(500, null, "Die Strafen konnten nicht geladen werden."),
    );
    renderSheet();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Strafen konnten nicht geladen werden.",
    );
  });
});

describe("PenaltySheet — the remaining states", () => {
  it("shows a loading note while the roster is still on its way", async () => {
    renderSheet({ roster: null });

    await screen.findByRole("group", { name: "Strafen" });
    expect(screen.getByText("Kader lädt …")).toBeInTheDocument();
  });

  it("says the penalty is for the whole team when no roster is loaded", async () => {
    renderSheet({ roster: [] });

    await screen.findByRole("group", { name: "Strafen" });
    expect(
      screen.getByText(
        "Kein Kader geladen – die Strafe wird für das ganze Team gespeichert.",
      ),
    ).toBeInTheDocument();
  });

  it("lets the official charge the opponent by hand", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    // "Strafe 02" is an offense penalty, so Ravens is the default.
    expect(teamButton("Ravens")).toHaveAttribute("aria-pressed", "true");
    await user.click(teamButton("Wolves"));
    await user.click(saveButton());

    expect(teamButton("Wolves")).toHaveAttribute("aria-pressed", "true");
    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", input: "Strafe 02" }],
      "Wolves",
    );
  });

  it("drops a picked jersey with 'Ganzes Team'", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    await user.click(screen.getByRole("button", { name: "Ganzes Team" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", input: "Strafe 02" }],
      "Ravens",
    );
  });

  it("offers a nameless jersey without an invented name", async () => {
    const { onSubmit } = renderSheet({
      roster: [
        { side: "home", jersey: 9, name: null },
        { side: "away", jersey: 11, name: "Wolf" },
      ],
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    await user.click(screen.getByRole("button", { name: "Trikot 9" }));
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [{ name: "Strafe", player: 9, input: "Strafe 02" }],
      "Ravens",
    );
  });

  it("ignores a second tap in the same tick", async () => {
    const submit = vi.fn<Submit>(
      () =>
        new Promise<void>(() => {
          // Never settles: the sheet stays busy.
        }),
    );
    renderSheet({ onSubmit: submit });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));

    fireEvent.click(saveButton());
    fireEvent.click(saveButton());

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not update state when the catalogue lands after unmount", async () => {
    let reject: (error: unknown) => void = () => undefined;
    apiGetMock.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const { unmount } = render(
      <PenaltySheet
        onClose={vi.fn()}
        onSubmit={vi.fn<Submit>(async () => undefined)}
        opponentName="Wolves"
        roster={ROSTER}
        side="home"
        teamName="Ravens"
      />,
    );

    unmount();
    reject(new ApiError(500, null, "spät"));

    // Nothing to assert on screen; the point is that no state update and no
    // unhandled rejection escapes after the unmount.
    await Promise.resolve();
  });
});
