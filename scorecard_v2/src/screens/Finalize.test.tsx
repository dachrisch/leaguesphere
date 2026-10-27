import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet, apiPut } from "../api/client";
import type { Game, GameLog, RosterPlayer } from "../api/types";
import FinalizeScreen, {
  pendingReason,
  rejectedReason,
  surnameOptions,
} from "./Finalize";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
  };
});

const apiGetMock = apiGet as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;

const ROSTER_PATH = "/api/game/42/roster";
const FINALIZE_PATH = "/api/game/42/finalize";

const GAME: Game = {
  id: 42,
  scheduled: "13:30:00",
  field: 2,
  officials: "Crew Rhein",
  officialsId: 7,
  stage: "Vorrunde",
  standing: "",
  home: "Ravens",
  away: "Wolves",
  points_home: null,
  points_away: null,
  status: "2. Halbzeit",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

const LOG: GameLog = {
  gameId: 42,
  isFirstHalf: false,
  inPossession: null,
  home: {
    id: 1,
    name: "Ravens",
    score: 21,
    firsthalf: { score: 14, entries: [] },
    secondhalf: { score: 7, entries: [] },
  },
  away: {
    id: 2,
    name: "Wolves",
    score: 14,
    firsthalf: { score: 7, entries: [] },
    secondhalf: { score: 7, entries: [] },
  },
};

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Müller" },
  { side: "home", jersey: 9, name: "Bauer" },
  { side: "home", jersey: 9, name: "Müller" },
  { side: "home", jersey: 11, name: null },
  { side: "away", jersey: 4, name: "Schmidt" },
  { side: "away", jersey: 8, name: "Yilmaz" },
];

let roster: RosterPlayer[];
let rosterFailure: unknown;
let finalizeFailure: unknown;

beforeEach(() => {
  roster = [...ROSTER];
  rosterFailure = null;
  finalizeFailure = null;
  apiGetMock.mockReset();
  apiPutMock.mockReset();
  apiGetMock.mockImplementation(async (path: string) => {
    if (path === ROSTER_PATH) {
      if (rosterFailure !== null) {
        throw rosterFailure;
      }
      return roster;
    }
    throw new Error(`unexpected GET ${path}`);
  });
  apiPutMock.mockImplementation(async (path: string) => {
    if (path !== FINALIZE_PATH) {
      throw new Error(`unexpected PUT ${path}`);
    }
    if (finalizeFailure !== null) {
      throw finalizeFailure;
    }
    return { homeCaptain: "Müller", awayCaptain: "Schmidt", note: "" };
  });
});

interface RenderOverrides {
  pendingWrites?: number;
  failedWrites?: number;
  /** What the 409 re-read finds: a finished log, or `null` (a real error). */
  conflictLog?: GameLog | null;
}

async function renderFinalize(overrides: RenderOverrides = {}) {
  const onBack = vi.fn();
  const onFinalized = vi.fn();
  const onFinalizeConflict = vi.fn(async () => overrides.conflictLog ?? null);
  const view = render(
    <FinalizeScreen
      failedWrites={overrides.failedWrites ?? 0}
      game={GAME}
      log={LOG}
      onBack={onBack}
      onFinalizeConflict={onFinalizeConflict}
      onFinalized={onFinalized}
      pendingWrites={overrides.pendingWrites ?? 0}
    />,
  );
  await screen.findByRole("group", { name: "Ravens: Captain" });
  return { onBack, onFinalized, onFinalizeConflict, ...view };
}

function captainGroup(team: string): HTMLElement {
  return screen.getByRole("group", { name: `${team}: Captain` });
}

function captainInput(team: string): HTMLInputElement {
  // `list` makes the input a combobox for assistive tech: a text field with
  // suggestions, not a select.
  return within(captainGroup(team)).getByRole("combobox") as HTMLInputElement;
}

function confirmButton(team: string): HTMLButtonElement {
  return within(captainGroup(team)).getByRole("button") as HTMLButtonElement;
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "Ergebnis abschicken",
  }) as HTMLButtonElement;
}

function suggestions(side: "home" | "away"): string[] {
  return Array.from(
    document.querySelectorAll<HTMLOptionElement>(
      `#captain-${side}-suggestions option`,
    ),
  ).map((option) => option.value);
}

/** Type a name and confirm it — the pair of steps every valid submit needs. */
async function nameAndConfirm(
  team: string,
  name: string,
): Promise<void> {
  await userEvent.type(captainInput(team), name);
  await userEvent.click(confirmButton(team));
}

async function confirmBoth(): Promise<void> {
  await nameAndConfirm("Ravens", "Müller");
  await nameAndConfirm("Wolves", "Schmidt");
}

describe("surname suggestions", () => {
  it("offers the roster surnames of each side", async () => {
    await renderFinalize();

    await waitFor(() => {
      expect(suggestions("home")).toEqual(["Bauer", "Müller"]);
    });
    expect(suggestions("away")).toEqual(["Schmidt", "Yilmaz"]);
    // A player without a name never becomes an empty suggestion.
    expect(suggestions("home")).not.toContain("");
  });

  it("still accepts a name that is not on the roster", async () => {
    const { onFinalized } = await renderFinalize();

    await userEvent.type(captainInput("Ravens"), "Neuling");
    await userEvent.click(confirmButton("Ravens"));
    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigt");
    await nameAndConfirm("Wolves", "Schmidt");
    await userEvent.click(submitButton());

    await waitFor(() => expect(onFinalized).toHaveBeenCalledWith(LOG));
    expect(apiPutMock).toHaveBeenCalledWith(FINALIZE_PATH, {
      homeCaptain: "Neuling",
      awayCaptain: "Schmidt",
      note: "",
    });
  });

  it("keeps the fields usable when the roster request failed", async () => {
    rosterFailure = new ApiError(500, null);
    await renderFinalize();

    await waitFor(() => expect(suggestions("home")).toEqual([]));
    await userEvent.type(captainInput("Ravens"), "Müller");
    expect(captainInput("Ravens")).toHaveValue("Müller");
  });

  it("filters and de-duplicates the roster without inventing a captain", () => {
    expect(surnameOptions(ROSTER, "home")).toEqual(["Bauer", "Müller"]);
    expect(surnameOptions(ROSTER, "away")).toEqual(["Schmidt", "Yilmaz"]);
    expect(surnameOptions(null, "home")).toEqual([]);
  });
});

describe("captain confirmation", () => {
  it("starts unconfirmed and keeps the submit disabled", async () => {
    await renderFinalize();

    expect(captainInput("Ravens")).toHaveValue("");
    expect(submitButton()).toBeDisabled();
    expect(
      screen.getByText("Bitte beide Captains bestätigen."),
    ).toBeInTheDocument();
  });

  it("does not confirm an empty field", async () => {
    await renderFinalize();

    expect(confirmButton("Ravens")).toBeDisabled();
    await userEvent.click(confirmButton("Ravens"));
    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigen");
    expect(confirmButton("Ravens")).toHaveAttribute("aria-pressed", "false");
  });

  it("requires both captains before the result can be sent", async () => {
    await renderFinalize();

    await nameAndConfirm("Ravens", "Müller");
    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigt");
    expect(confirmButton("Ravens")).toHaveAttribute("aria-pressed", "true");
    // The confirmed name is locked until the confirmation is taken back.
    expect(captainInput("Ravens")).toBeDisabled();
    expect(submitButton()).toBeDisabled();

    await nameAndConfirm("Wolves", "Schmidt");
    expect(submitButton()).toBeEnabled();
    expect(
      screen.queryByText("Bitte beide Captains bestätigen."),
    ).not.toBeInTheDocument();
  });

  it("toggles a confirmation back so the name can be corrected", async () => {
    await renderFinalize();

    await nameAndConfirm("Ravens", "Müller");
    await userEvent.click(confirmButton("Ravens"));

    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigen");
    expect(captainInput("Ravens")).toBeEnabled();
    await userEvent.clear(captainInput("Ravens"));
    await userEvent.type(captainInput("Ravens"), "Bauer");
    await userEvent.click(confirmButton("Ravens"));
    expect(captainInput("Ravens")).toHaveValue("Bauer");
    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigt");
  });
});

describe("submitting the result", () => {
  it("sends both captains and an empty note as \"\"", async () => {
    const { onFinalized } = await renderFinalize();

    await confirmBoth();
    await userEvent.click(submitButton());

    await waitFor(() => expect(onFinalized).toHaveBeenCalledWith(LOG));
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(FINALIZE_PATH, {
      homeCaptain: "Müller",
      awayCaptain: "Schmidt",
      note: "",
    });
  });

  it("sends the optional note when one was written", async () => {
    await renderFinalize();

    await confirmBoth();
    fireEvent.change(screen.getByLabelText("Anmerkung optional"), {
      target: { value: "DQ Ravens #7" },
    });
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(apiPutMock).toHaveBeenCalledWith(FINALIZE_PATH, {
        homeCaptain: "Müller",
        awayCaptain: "Schmidt",
        note: "DQ Ravens #7",
      }),
    );
  });

  it("shows the server detail of a rejected transition and keeps the state", async () => {
    finalizeFailure = new ApiError(
      409,
      { detail: "Dieser Spielstatus erlaubt kein Spielende." },
      "Dieser Spielstatus erlaubt kein Spielende.",
    );
    const { onFinalized } = await renderFinalize();

    await confirmBoth();
    fireEvent.change(screen.getByLabelText("Anmerkung optional"), {
      target: { value: "längere Pause" },
    });
    await userEvent.click(submitButton());

    expect(
      await screen.findByText("Dieser Spielstatus erlaubt kein Spielende."),
    ).toBeInTheDocument();
    expect(onFinalized).not.toHaveBeenCalled();
    // Nothing was reset: the retry must not repeat the confirmation work.
    expect(captainInput("Ravens")).toHaveValue("Müller");
    expect(confirmButton("Ravens")).toHaveTextContent("Bestätigt");
    expect(confirmButton("Wolves")).toHaveTextContent("Bestätigt");
    expect(screen.getByLabelText("Anmerkung optional")).toHaveValue(
      "längere Pause",
    );
    expect(submitButton()).toBeEnabled();
  });

  it("shows the result when a 409 says the game is already finished", async () => {
    finalizeFailure = new ApiError(
      409,
      { detail: "Dieser Spielstatus erlaubt kein Spielende." },
      "Dieser Spielstatus erlaubt kein Spielende.",
    );
    const finished: GameLog = { ...LOG, isFirstHalf: false };
    const { onFinalized, onFinalizeConflict } = await renderFinalize({
      conflictLog: finished,
    });

    await confirmBoth();
    await userEvent.click(submitButton());

    await waitFor(() => expect(onFinalizeConflict).toHaveBeenCalledTimes(1));
    expect(onFinalized).toHaveBeenCalledWith(finished);
    expect(
      screen.queryByText("Dieser Spielstatus erlaubt kein Spielende."),
    ).not.toBeInTheDocument();
  });

  it("falls back to its own message on an error without a detail", async () => {
    finalizeFailure = new ApiError(500, null);
    const { onFinalized } = await renderFinalize();

    await confirmBoth();
    await userEvent.click(submitButton());

    expect(
      await screen.findByText(
        "Das Spielende konnte nicht gesendet werden. Bitte erneut versuchen.",
      ),
    ).toBeInTheDocument();
    expect(onFinalized).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("shows the score line and both halves before sending", async () => {
    await renderFinalize();

    const board = screen.getByLabelText("Spielstand");
    expect(board.querySelector(".finalhome")).toHaveTextContent("Ravens");
    expect(board.querySelector(".finalaway")).toHaveTextContent("Wolves");
    expect(board.querySelector(".finalpoints")).toHaveTextContent("21:14");
    expect(
      within(within(board).getByRole("table")).getByRole("row", {
        name: "Ravens 14 7",
      }),
    ).toBeInTheDocument();
    expect(
      within(within(board).getByRole("table")).getByRole("row", {
        name: "Wolves 7 7",
      }),
    ).toBeInTheDocument();
  });
});

describe("the outbox guard", () => {
  it("blocks the send while entries wait for the transfer", async () => {
    await renderFinalize({ pendingWrites: 3 });

    await confirmBoth();
    expect(
      screen.getByText("3 Einträge warten auf Übertragung"),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAccessibleDescription(
      /3 Einträge warten auf Übertragung/,
    );
    expect(apiPutMock).not.toHaveBeenCalled();
  });

  it("blocks the send while entries were rejected", async () => {
    await renderFinalize({ failedWrites: 2 });

    await confirmBoth();
    expect(screen.getByText("2 Einträge abgelehnt")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(apiPutMock).not.toHaveBeenCalled();
  });

  it("names a single entry in the singular", () => {
    expect(pendingReason(1)).toBe("1 Eintrag wartet auf Übertragung");
    expect(pendingReason(3)).toBe("3 Einträge warten auf Übertragung");
    expect(rejectedReason(1)).toBe("1 Eintrag abgelehnt");
    expect(rejectedReason(5)).toBe("5 Einträge abgelehnt");
  });

  it("lifts the guard once the queue is empty", async () => {
    await renderFinalize({ pendingWrites: 0, failedWrites: 0 });

    await confirmBoth();
    expect(submitButton()).toBeEnabled();
  });
});

describe("the way back to tracking", () => {
  it("returns to tracking before a captain is confirmed", async () => {
    const { onBack } = await renderFinalize();

    expect(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("is disabled once a captain is confirmed", async () => {
    await renderFinalize();

    await nameAndConfirm("Ravens", "Müller");
    expect(
      screen.getByRole("button", { name: "Spielstand bearbeiten" }),
    ).toBeDisabled();
  });
});

describe("header", () => {
  it("reads Spielende with the game and the confirmation", async () => {
    await renderFinalize();

    expect(
      screen.getByRole("heading", { level: 1, name: "Spielende" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ravens – Wolves · Bestätigung"),
    ).toBeInTheDocument();
  });
});

describe("team labels", () => {
  it("falls back to the game row when the log carries no team name", async () => {
    render(
      <FinalizeScreen
        failedWrites={0}
        game={GAME}
        log={{
          ...LOG,
          home: { ...LOG.home, name: "   " },
          away: { ...LOG.away, name: null },
        }}
        onBack={vi.fn()}
        onFinalized={vi.fn()}
        pendingWrites={0}
      />,
    );

    expect(
      await screen.findByRole("group", { name: "Ravens: Captain" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Wolves: Captain" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ravens – Wolves · Bestätigung/)).toBeInTheDocument();
  });

  it("shows a dash when neither the log nor the game names a team", async () => {
    render(
      <FinalizeScreen
        failedWrites={0}
        game={{ ...GAME, home: "", away: "" }}
        log={{
          ...LOG,
          home: { ...LOG.home, name: null },
          away: { ...LOG.away, name: "" },
        }}
        onBack={vi.fn()}
        onFinalized={vi.fn()}
        pendingWrites={0}
      />,
    );

    expect((await screen.findAllByRole("group", { name: "–: Captain" }))).toHaveLength(2);
    expect(screen.getByText(/– – – · Bestätigung/)).toBeInTheDocument();
  });
});

describe("without the conflict handler", () => {
  it("shows the 409 as an error instead of re-reading", async () => {
    finalizeFailure = new ApiError(
      409,
      { detail: "Das Spiel ist bereits beendet." },
      "Das Spiel ist bereits beendet.",
    );
    render(
      <FinalizeScreen
        failedWrites={0}
        game={GAME}
        log={LOG}
        onBack={vi.fn()}
        onFinalized={vi.fn()}
        pendingWrites={0}
      />,
    );
    await screen.findByRole("group", { name: "Ravens: Captain" });
    const user = userEvent.setup();
    for (const side of ["Ravens", "Wolves"]) {
      await user.type(
        within(screen.getByRole("group", { name: `${side}: Captain` })).getByRole(
          "combobox",
        ),
        "Meier",
      );
      await user.click(
        within(screen.getByRole("group", { name: `${side}: Captain` })).getByRole(
          "button",
          { name: "Bestätigen" },
        ),
      );
    }

    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Spiel ist bereits beendet.",
    );
  });
});
