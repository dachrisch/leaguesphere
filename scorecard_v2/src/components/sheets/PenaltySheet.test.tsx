import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet } from "../../api/client";
import type { GameRules } from "../../api/rules";
import type { GameLogEventInput, Penalty, RosterPlayer } from "../../api/types";
import type { LogRow } from "../EventLog";
import PenaltySheet, {
  filterPenalties,
  numbersFromText,
  orderPenalties,
  PENALTY_PAGE,
  penaltyEvent,
  penaltyKind,
  penaltyNextDown,
  penaltyTeam,
  penaltyYardage,
  type UnsportsmanlikeRecord,
  unsportsmanlikeRecord,
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
  history?: UnsportsmanlikeRecord[];
}

function logRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    key: "e1",
    teamLogId: 1,
    eventSeq: 1,
    groupSequence: 1,
    team: "Ravens",
    event: "Strafe",
    player: null,
    input: "Unsportliches Verhalten Offense",
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-11-05T10:00:00Z",
    payload: null,
    ...overrides,
  };
}

function renderSheet(options: RenderOptions = {}) {
  if (options.penalties !== undefined) {
    apiGetMock.mockResolvedValue(options.penalties);
  }
  const submit = options.onSubmit ?? vi.fn<Submit>(async () => undefined);
  const onClose = vi.fn();
  render(
    <PenaltySheet
      history={options.history}
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
    name: /^(Speichern|Speichern …|Strafe wählen|Team wählen|Nummer wählen)$/,
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

  it("sends the penalty as input with an optional player and the spot change", () => {
    expect(penaltyEvent("Fehlstart", null, -5, "loss_of_down")).toEqual({
      name: "Strafe",
      input: "Fehlstart",
      payload: { yardage: -5, nextDown: "loss_of_down" },
    });
    expect(penaltyEvent("Fehlstart", 23, 10, "first_down")).toEqual({
      name: "Strafe",
      player: 23,
      input: "Fehlstart",
      payload: { yardage: 10, nextDown: "first_down" },
    });
  });

  it("prefills yardage and next down from the subtext", () => {
    const penalty = (subtext: string, defense = false): Penalty => ({
      name: "X",
      subtext,
      isPenaltyAgainstOpponent: defense,
    });

    expect(penaltyYardage(penalty("BS/1st 10", true))).toBe(10);
    expect(penaltyNextDown(penalty("BS/1st 10", true))).toBe("first_down");
    expect(penaltyYardage(penalty("SF/LoD 5"))).toBe(-5);
    expect(penaltyNextDown(penalty("SF/LoD 5"))).toBe("loss_of_down");
    expect(penaltyYardage(penalty("SL/5"))).toBe(-5);
    expect(penaltyNextDown(penalty("SL/5"))).toBe("repeat");
    expect(penaltyYardage(penalty("Disqualifkation"))).toBe(0);
    expect(penaltyNextDown(penalty("Disqualifkation"))).toBe("repeat");
  });

  it("classifies disqualification, UNV and ordinary penalties", () => {
    const penalty = (name: string, subtext: string): Penalty => ({
      name,
      subtext,
      isPenaltyAgainstOpponent: false,
    });

    expect(
      penaltyKind(penalty("Unsportliches Verhalten Offense", "DB/10 Notiz")),
    ).toBe("unsportsmanlike");
    expect(
      penaltyKind(
        penalty("Grob unsportliches Verhalten Offense", "Disqualifkation"),
      ),
    ).toBe("disqualification");
    expect(penaltyKind(penalty("Fehlstart", "DB/5"))).toBe("normal");
  });

  it("reads jersey numbers from a free-text UNV note", () => {
    expect(numbersFromText("12, 7 23")).toEqual([12, 7, 23]);
    expect(numbersFromText("12, 12")).toEqual([12]);
    expect(numbersFromText("123 5")).toEqual([5]);
    expect(numbersFromText("")).toEqual([]);
  });

  it("turns an UNV row into the history the sheet shows", () => {
    expect(
      unsportsmanlikeRecord(
        logRow({
          payload: { unsportsmanlike: "12, 7" },
        }),
      ),
    ).toEqual({ team: "Ravens", half: 1, text: "12, 7", numbers: [12, 7] });

    // A row written by the previous build carries one jersey, not the note.
    expect(
      unsportsmanlikeRecord(logRow({ player: 9, payload: null })),
    ).toEqual({ team: "Ravens", half: 1, text: "9", numbers: [9] });

    expect(
      unsportsmanlikeRecord(
        logRow({ input: "Grob unsportliches Verhalten Offense" }),
      ),
    ).toBeNull();
    expect(unsportsmanlikeRecord(logRow({ isDeleted: true }))).toBeNull();
    expect(
      unsportsmanlikeRecord(logRow({ event: "Fehlstart" })),
    ).toBeNull();
  });

  it("keeps a free-text UNV note in the event payload", () => {
    expect(
      penaltyEvent("Unsportliches Verhalten Offense", null, -10, "repeat", "12, 7"),
    ).toEqual({
      name: "Strafe",
      input: "Unsportliches Verhalten Offense",
      payload: {
        yardage: -10,
        nextDown: "repeat",
        unsportsmanlike: "12, 7",
      },
    });
  });

  it("keeps the first five penalties in order and sorts the rest", () => {
    const list: Penalty[] = [
      "Zebra",
      "Adler",
      "Wolf",
      "Bär",
      "Dachs",
      "Igel",
      "Eule",
    ].map((name) => ({
      name,
      subtext: "5 Yards",
      isPenaltyAgainstOpponent: false,
    }));

    expect(orderPenalties(list, "").map((penalty) => penalty.name)).toEqual([
      "Zebra",
      "Adler",
      "Wolf",
      "Bär",
      "Dachs",
      "Eule",
      "Igel",
    ]);
    expect(orderPenalties(list, "l").map((penalty) => penalty.name)).toEqual([
      "Adler",
      "Eule",
      "Igel",
      "Wolf",
    ]);
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

  it("opens as the wide dialog with the choice beside the details", async () => {
    renderSheet();

    await screen.findByRole("group", { name: "Strafen" });
    const dialog = screen.getByRole("dialog", { name: "Strafe" });
    expect(dialog).toHaveClass("sheet-wide");
    // Two columns on a desktop: what (search + list) | for whom and how far.
    const columns = Array.from(dialog.querySelectorAll(".penaltycol"));
    expect(columns).toHaveLength(2);
    const [choice, details] = columns;
    expect(choice).toContainElement(
      screen.getByRole("group", { name: "Strafen" }),
    );
    expect(details).toContainElement(
      screen.getByRole("group", { name: "Gegen wen?" }),
    );
    expect(details).toContainElement(
      screen.getByRole("group", { name: "Nächster Versuch" }),
    );
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
      [
        {
          name: "Strafe",
          input: "Strafe 01",
          payload: { yardage: 5, nextDown: "repeat" },
        },
      ],
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
      [
        {
          name: "Strafe",
          input: "Strafe 02",
          payload: { yardage: -10, nextDown: "repeat" },
        },
      ],
      "Ravens",
    );
  });

  it("defaults the player to 'Ohne Nummer' and keeps 'Ganzes Team' last", async () => {
    renderSheet();

    const group = within(
      screen.getByRole("group", { name: "Trikotnummer (optional)" }),
    );
    const none = group.getByRole("button", { name: "Ohne Nummer" });
    const team = group.getByRole("button", { name: "Ganzes Team" });
    expect(none).toHaveAttribute("aria-pressed", "true");
    expect(team).toHaveAttribute("aria-pressed", "false");
    // The explicit "Ganzes Team" closes the row, after the jerseys.
    const jersey = group.getByRole("button", { name: /Trikot 23/ });
    expect(
      jersey.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
      [
        {
          name: "Strafe",
          player: 11,
          input: "Strafe 01",
          payload: { yardage: 5, nextDown: "repeat" },
        },
      ],
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
      screen.getByRole("button", { name: "Ohne Nummer" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [
        {
          name: "Strafe",
          input: "Strafe 01",
          payload: { yardage: 5, nextDown: "repeat" },
        },
      ],
      "Ravens",
    );
  });

  it("prefills yardage and next down from the selected penalty", async () => {
    renderSheet({
      penalties: [
        {
          name: "Defense Passbehinderung",
          subtext: "BS/1st 10",
          isPenaltyAgainstOpponent: true,
        },
        {
          name: "Flag Guarding",
          subtext: "SF/LoD 5",
          isPenaltyAgainstOpponent: false,
        },
      ],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /Defense Passbehinderung/ }),
    );
    expect(screen.getByRole("textbox", { name: "Yardage (0–50)" })).toHaveValue(
      "10",
    );
    expect(
      within(screen.getByRole("group", { name: "Nächster Versuch" })).getByRole(
        "button",
        { name: "First Down" },
      ),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Flag Guarding/ }));
    expect(screen.getByRole("textbox", { name: "Yardage (0–50)" })).toHaveValue(
      "5",
    );
    expect(
      within(screen.getByRole("group", { name: "Nächster Versuch" })).getByRole(
        "button",
        { name: "Loss of Down" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("group", { name: "Raumrichtung" })).getByRole(
        "button",
        { name: "Verlust" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the official correct the yardage and the next down", async () => {
    const { onSubmit } = renderSheet();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Strafe 02/ }));
    await user.click(screen.getByRole("button", { name: "Gewinn" }));
    const yards = screen.getByRole("textbox", { name: "Yardage (0–50)" });
    await user.clear(yards);
    await user.type(yards, "7");
    await user.click(
      within(screen.getByRole("group", { name: "Nächster Versuch" })).getByRole(
        "button",
        { name: "First Down" },
      ),
    );
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [
        {
          name: "Strafe",
          input: "Strafe 02",
          payload: { yardage: 7, nextDown: "first_down" },
        },
      ],
      "Ravens",
    );
  });

  it("requires a jersey for a disqualification", async () => {
    const { onSubmit } = renderSheet({
      penalties: [
        {
          name: "Grob unsportliches Verhalten Offense",
          subtext: "Disqualifkation",
          isPenaltyAgainstOpponent: false,
        },
      ],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Grob unsportliches Verhalten Offense/,
      }),
    );

    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Nummer wählen");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bei einer Disqualifikation ist die Trikotnummer Pflicht.",
    );

    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    expect(saveButton()).toBeEnabled();
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [
        {
          name: "Strafe",
          player: 23,
          input: "Grob unsportliches Verhalten Offense",
          payload: { yardage: 0, nextDown: "repeat" },
        },
      ],
      "Ravens",
    );
  });

  it("tracks the numbers of an unsportsmanlike conduct as free text", async () => {
    const { onSubmit } = renderSheet({
      penalties: [
        {
          name: "Unsportliches Verhalten Offense",
          subtext: "DB/10 Notiz",
          isPenaltyAgainstOpponent: false,
        },
      ],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Unsportliches Verhalten Offense/,
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Nummern als Freitext" }),
      "12, 7",
    );
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [
        {
          name: "Strafe",
          input: "Unsportliches Verhalten Offense",
          payload: {
            yardage: -10,
            nextDown: "repeat",
            unsportsmanlike: "12, 7",
          },
        },
      ],
      "Ravens",
    );
  });

  it("keeps the UNV numbers optional", async () => {
    const { onSubmit } = renderSheet({
      penalties: [
        {
          name: "Unsportliches Verhalten Offense",
          subtext: "DB/10 Notiz",
          isPenaltyAgainstOpponent: false,
        },
      ],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Unsportliches Verhalten Offense/,
      }),
    );
    await user.click(saveButton());

    expect(onSubmit).toHaveBeenCalledWith(
      [
        {
          name: "Strafe",
          input: "Unsportliches Verhalten Offense",
          payload: { yardage: -10, nextDown: "repeat" },
        },
      ],
      "Ravens",
    );
  });

  it("shows the team's earlier UNV and warns about the second one", async () => {
    renderSheet({
      penalties: [
        {
          name: "Unsportliches Verhalten Offense",
          subtext: "DB/10 Notiz",
          isPenaltyAgainstOpponent: false,
        },
      ],
      history: [{ team: "Ravens", half: 1, text: "12", numbers: [12] }],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: /Unsportliches Verhalten Offense/,
      }),
    );

    expect(screen.getByText("Bisher für Ravens")).toBeInTheDocument();
    expect(screen.getByText(/Halbzeit 1: Nr\. 12/)).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Nummern als Freitext" }),
      "12",
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nr. 12 hat bereits 1 UNV",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "dieser Eintrag wäre der 2.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "automatisch disqualifiziert",
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
      [
        {
          name: "Strafe",
          input: "Strafe 02",
          payload: { yardage: -10, nextDown: "repeat" },
        },
      ],
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
      [
        {
          name: "Strafe",
          input: "Strafe 02",
          payload: { yardage: -10, nextDown: "repeat" },
        },
      ],
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
      [
        {
          name: "Strafe",
          player: 9,
          input: "Strafe 02",
          payload: { yardage: -10, nextDown: "repeat" },
        },
      ],
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

describe("the penalty numbers come from the definition", () => {
  it("uses the structured yards instead of parsing the subtext", () => {
    const handoff: Penalty = {
      name: "illegale Ballübergabe",
      // the old text alone would say 0 yards
      subtext: "SF/LoD",
      isPenaltyAgainstOpponent: false,
      yards: 5,
      down: "loss",
      enforcement: "SF",
      rule: "7-1-5",
    };

    expect(penaltyYardage(handoff)).toBe(-5);
    expect(penaltyNextDown(handoff)).toBe("loss_of_down");
  });

  it("uses the structured down rule for a defence foul", () => {
    const interference: Penalty = {
      name: "Defense Passbehinderung",
      subtext: "BS/1st 10",
      isPenaltyAgainstOpponent: true,
      yards: 10,
      down: "first",
      enforcement: "BS",
      rule: "7-3-3",
    };

    expect(penaltyYardage(interference)).toBe(10);
    expect(penaltyNextDown(interference)).toBe("first_down");
  });

  it("keeps parsing the subtext when only the legacy list answered", () => {
    expect(
      penaltyYardage({
        name: "illegaler Kontakt Offense",
        subtext: "BS/LoD 10",
        isPenaltyAgainstOpponent: false,
      }),
    ).toBe(-10);
    expect(
      penaltyNextDown({
        name: "illegale Ballübergabe",
        subtext: "SF/LoD",
        isPenaltyAgainstOpponent: false,
      }),
    ).toBe("loss_of_down");
  });
});

describe("the penalty numbers follow the field", () => {
  it("offers at most the field length", async () => {
    render(
      <PenaltySheet
        onClose={vi.fn()}
        onSubmit={vi.fn<Submit>(async () => undefined)}
        opponentName="Wolves"
        roster={ROSTER}
        side="home"
        teamName="Ravens"
      />,
    );
    const user = userEvent.setup();

    // a defence penalty (the fixture's odd rows): its suggested yards are +5
    await user.click(
      await screen.findByRole("button", { name: /Strafe 01/ }),
    );
    const yards = screen.getByRole("textbox", { name: /Yardage/ });
    await user.clear(yards);
    await user.type(yards, "99");

    expect(
      screen.getByText(/höchstens 50 Yards/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });

  it("shows the spot the enforcement leaves, half distance included", async () => {
    render(
      <PenaltySheet
        ballOn={5}
        onClose={vi.fn()}
        onSubmit={vi.fn<Submit>(async () => undefined)}
        opponentName="Wolves"
        roster={ROSTER}
        side="home"
        teamName="Ravens"
      />,
    );
    const user = userEvent.setup();

    // an offence penalty of 10 yards at A5: half the distance, A2,5
    await user.click(
      await screen.findByRole("button", { name: /Strafe 02/ }),
    );

    // a 10-yard offence penalty from A5 is half the distance: A2,5
    expect(await screen.findByText(/Nach der Strafe: A2,5/)).toBeInTheDocument();
  });
});

describe("the catalogue from the definition", () => {
  const rules: GameRules = {
    sport: "flag_football",
    variant: "5v5",
    ruleset: "IFAF 2023",
    field: {
      length: 50,
      width: 25,
      end_zone: 10,
      middle: 25,
      no_run_zone: 5,
      spot_precision: 0.5,
    },
    series: {
      downs: 4,
      start: 5,
      line_to_gain: ["middle", "goal"],
      first_down_at_middle: "once",
      turnover_on_downs_spot: 5,
      interception_spot: "dead_ball",
    },
    scoring: {
      touchdown: 6,
      try: { "5": 1, "10": 2 },
      try_defense: 2,
      try_safety: 1,
      safety: 2,
      touchback_spot: 5,
      after_try_spot: 5,
      safety_spot: 5,
    },
    periods: {
      count: 2,
      length_minutes: 20,
      intermission_minutes: 2,
      play_clock_seconds: 25,
      pass_clock_seconds: 7,
      running_clock_diff: 30,
    },
    timeouts: { per_half: 2, seconds: 60, carry_over: false, in_overtime: false },
    overtime: {
      start_spot: 25,
      first_down_at_middle: false,
      tiebreak_try: { spot: 5, points: 1 },
    },
    officials: { counts: [2, 3, 4] },
    penalties: [
      {
        code: "illegal_handoff",
        name: "illegale Ballübergabe",
        subtext: "SF/LoD",
        yards: 5,
        down: "loss",
        enforcement: "SF",
        side: "offense",
        rule: "7-1-5",
      },
      {
        code: "shielding",
        name: "Abschirmen (Blocken) Defense",
        subtext: "BS/5",
        yards: 5,
        down: "repeat",
        enforcement: "BS",
        side: "defense",
        rule: "9-2-2a",
      },
    ],
  };

  it("offers the definition's rows and prefills their numbers", async () => {
    render(
      <PenaltySheet
        onClose={vi.fn()}
        onSubmit={vi.fn<Submit>(async () => undefined)}
        opponentName="Wolves"
        roster={ROSTER}
        rules={rules}
        side="home"
        teamName="Ravens"
      />,
    );
    const user = userEvent.setup();

    // the legacy list is not even fetched when the definition is there
    const row = await screen.findByRole("button", {
      name: /illegale Ballübergabe/,
    });
    await user.click(row);

    expect(screen.getByRole("textbox", { name: /Yardage/ })).toHaveValue("5");
    expect(screen.getByRole("button", { name: "Loss of Down" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(
      screen.getByRole("button", { name: /Abschirmen \(Blocken\) Defense/ }),
    );
    // a defence penalty is charged to the opponent and moves the ball their way
    expect(screen.getByRole("button", { name: "Wolves" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("falls back to the subtext when a row carries no structured down rule", () => {
    expect(
      penaltyNextDown({
        name: "Fehlstart",
        subtext: "DB/5",
        isPenaltyAgainstOpponent: false,
      }),
    ).toBe("repeat");
  });
});
