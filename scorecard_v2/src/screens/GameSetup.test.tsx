import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiGet, apiPut, setDeviceId } from "../api/client";
import type {
  Game,
  GameLog,
  GameSetup,
  Official,
  TeamOfficial,
} from "../api/types";
import { getDeviceId } from "../device";
import GameSetupScreen from "./GameSetup";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPut: vi.fn(),
    setDeviceId: vi.fn(),
  };
});

vi.mock("../device", () => ({
  getDeviceId: vi.fn(() => "device-1"),
}));

const apiGetMock = apiGet as unknown as Mock;
const apiPutMock = apiPut as unknown as Mock;
const setDeviceIdMock = setDeviceId as unknown as Mock;
const getDeviceIdMock = getDeviceId as unknown as Mock;

const CREW_PATH = "/api/game/42/officials";
const SETUP_PATH = "/api/game/42/setup";
const POSSESSION_PATH = "/api/game/42/possession";
const TEAM_PATH = "/api/officials/team/7/list";
const LOG_PATH = "/api/gamelog/42";

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
  status: "Geplant",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

interface CrewOverrides {
  id?: number;
  official?: number | null;
  name?: string | null;
  position?: string;
}

function crewRow(overrides: CrewOverrides = {}): Official {
  return {
    id: 1,
    official: 11,
    name: "Michael Klein",
    position: "Referee",
    ...overrides,
  };
}

interface TeamOverrides {
  id?: number;
  first_name?: string;
  last_name?: string;
  license?: string | null;
  valid_until?: string | null;
  is_valid?: boolean;
}

function teamPerson(overrides: TeamOverrides = {}): TeamOfficial {
  return {
    id: 11,
    first_name: "Michael",
    last_name: "Klein",
    team: "Crew Rhein",
    license: "B",
    valid_until: "2027-06-30",
    is_valid: true,
    ...overrides,
  };
}

const LOG: GameLog = {
  gameId: 42,
  isFirstHalf: true,
  home: {
    id: 1,
    name: "Ravens",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
  },
  away: {
    id: 2,
    name: "Wolves",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
  },
};

let crew: Official[];
let teamList: TeamOfficial[];
let setup: GameSetup;
let startCalls: string[];
let setupFailure: unknown;
let crewFailure: unknown;

beforeEach(() => {
  crew = [
    crewRow(),
    crewRow({
      id: 2,
      official: 12,
      name: "Anna Richter",
      position: "Scorecard Judge",
    }),
  ];
  teamList = [
    teamPerson(),
    teamPerson({
      id: 12,
      first_name: "Anna",
      last_name: "Richter",
      license: "C",
      valid_until: "2028-01-31",
    }),
    teamPerson({
      id: 13,
      first_name: "Tom",
      last_name: "Weber",
      license: "C",
      valid_until: "2025-03-04",
      is_valid: false,
    }),
    teamPerson({
      id: 14,
      first_name: "Sabine",
      last_name: "Lang",
      license: "B",
      valid_until: "2028-12-31",
    }),
  ];
  setup = {};
  startCalls = [];
  setupFailure = null;
  crewFailure = null;

  apiGetMock.mockReset();
  apiPutMock.mockReset();
  setDeviceIdMock.mockReset();
  getDeviceIdMock.mockReset();
  getDeviceIdMock.mockReturnValue("device-1");

  apiGetMock.mockImplementation(async (path: string) => {
    switch (path) {
      case CREW_PATH:
        return crew;
      case TEAM_PATH:
        return teamList;
      case SETUP_PATH:
        return setup;
      case LOG_PATH:
        startCalls.push(`GET ${path}`);
        return LOG;
      default:
        throw new Error(`unexpected GET ${path}`);
    }
  });

  apiPutMock.mockImplementation(async (path: string, body: unknown) => {
    startCalls.push(`PUT ${path}`);
    if (path === CREW_PATH && crewFailure !== null) {
      throw crewFailure;
    }
    if (path === SETUP_PATH && setupFailure !== null) {
      throw setupFailure;
    }
    if (path === SETUP_PATH) {
      return { ...(body as GameSetup) };
    }
    if (path === CREW_PATH) {
      return [];
    }
    if (path === POSSESSION_PATH) {
      return undefined;
    }
    throw new Error(`unexpected PUT ${path}`);
  });
});

async function renderSetup(overrides: Partial<Game> = {}) {
  const onStarted = vi.fn();
  const view = render(
    <GameSetupScreen
      game={{ ...GAME, ...overrides }}
      onStarted={onStarted}
    />,
  );
  await screen.findByRole("group", { name: "Münzwurf" });
  return { onStarted, ...view };
}

function startButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(".startbtn");
  if (button === null) {
    throw new Error("start button is missing");
  }
  return button;
}

function crewSelect(label: string): HTMLSelectElement {
  return screen.getByRole("combobox", {
    name: `${label}: Offiziellen wählen`,
  }) as HTMLSelectElement;
}

function rowFor(label: string): HTMLElement {
  const row = crewSelect(label).closest(".offrow");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no crew row for ${label}`);
  }
  return row;
}

async function clickStart(): Promise<void> {
  await userEvent.click(startButton());
}

describe("GameSetup — header and crew", () => {
  it("renders the preparation header with the game context", async () => {
    await renderSetup();

    expect(
      screen.getByRole("heading", { level: 1, name: "Vorbereitung" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ravens – Wolves · 13:30 · Feld 2"),
    ).toBeInTheDocument();
  });

  it("shows crew names and their roles", async () => {
    await renderSetup();

    expect(crewSelect("Schiedsrichter")).toHaveValue("11");
    expect(crewSelect("Scorecard Judge")).toHaveValue("12");
    expect(
      within(rowFor("Schiedsrichter")).getByText("Schiedsrichter"),
    ).toBeInTheDocument();
    expect(screen.getByText("Scorecard Judge")).toBeInTheDocument();
    // Only the four refereed positions count; the Scorecard Judge is optional.
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("does not offer an official who already fills another slot", async () => {
    await renderSetup();

    const judge = crewSelect("Scorecard Judge");
    expect(
      within(judge).queryByRole("option", { name: "Michael Klein" }),
    ).toBeNull();
    expect(
      within(judge).getByRole("option", { name: "Anna Richter" }),
    ).toBeInTheDocument();

    const referee = crewSelect("Schiedsrichter");
    expect(
      within(referee).queryByRole("option", { name: "Anna Richter" }),
    ).toBeNull();
    expect(within(referee).getByRole("option", { name: "Tom Weber" }))
      .toBeInTheDocument();
  });

  it("keeps a free-text crew name when no official is linked", async () => {
    crew[0] = crewRow({ official: null, name: "Gast Schiri" });
    await renderSetup();

    expect(crewSelect("Schiedsrichter")).toHaveValue("");
    expect(
      within(rowFor("Schiedsrichter")).getByRole("option", {
        name: "Gast Schiri",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Schiedsrichter")).getByText("keine Lizenz"),
    ).toBeInTheDocument();
  });

  it("shows an unknown position unchanged instead of aliasing it", async () => {
    crew = [crewRow({ position: "Schiedsrichter" })];
    await renderSetup();

    // The Referee slot stays empty: writing "Referee" would create a duplicate.
    expect(crewSelect("Schiedsrichter")).toHaveValue("");
    expect(screen.getByText("0/4")).toBeInTheDocument();
    const extra = document.querySelector(".offname");
    expect(extra).toHaveTextContent("Michael Klein");
    expect(extra?.closest(".offrow")).toHaveTextContent("Schiedsrichter");
  });
});

describe("GameSetup — licences", () => {
  it("marks a valid licence", async () => {
    await renderSetup();

    const row = rowFor("Schiedsrichter");
    expect(within(row).getByText("Lizenz gültig")).toHaveClass("lic-ok");
    expect(within(row).queryByText(/abgelaufen/)).not.toBeInTheDocument();
  });

  it("shows the expiry date of an expired licence", async () => {
    teamList[0] = teamPerson({ is_valid: false, valid_until: "2025-03-04" });
    await renderSetup();

    const row = rowFor("Schiedsrichter");
    expect(
      within(row).getByText("abgelaufen seit 04.03.2025"),
    ).toHaveClass("lic-warn");
  });

  it("says 'keine Lizenz' for a linked official without a licence", async () => {
    teamList[0] = teamPerson({ license: null, is_valid: false });
    await renderSetup();

    expect(
      within(rowFor("Schiedsrichter")).getByText("keine Lizenz"),
    ).toHaveClass("lic-missing");
  });

  it("says 'Lizenz unbekannt' when the official cannot be judged", async () => {
    crew[0] = crewRow({ official: 99, name: "Gast Schiri" });
    await renderSetup();

    expect(
      within(rowFor("Schiedsrichter")).getByText("Lizenz unbekannt"),
    ).toHaveClass("lic-unknown");
    // A guest official is not a known licence problem.
    expect(document.querySelector(".setupwarn")).toBeNull();
  });

  it("says 'keine Lizenz' for an unlinked free-text official", async () => {
    crew[0] = crewRow({ official: null, name: "Gast Schiri" });
    await renderSetup();

    expect(
      within(rowFor("Schiedsrichter")).getByText("keine Lizenz"),
    ).toBeInTheDocument();
  });

  it("warns once for several invalid licences instead of per person", async () => {
    teamList[0] = teamPerson({ is_valid: false, valid_until: "2025-03-04" });
    teamList[1] = teamPerson({
      id: 12,
      first_name: "Anna",
      last_name: "Richter",
      license: null,
      valid_until: null,
      is_valid: false,
    });
    const { container } = await renderSetup();

    const warnings = container.querySelectorAll(".setupwarn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toHaveTextContent("2 Lizenzen sind nicht gültig");
    expect(warnings[0]).toHaveTextContent("Michael Klein (Schiedsrichter)");
    expect(warnings[0]).toHaveTextContent("Anna Richter (Scorecard Judge)");
    expect(warnings[0]).toHaveTextContent(
      "Das Spiel lässt sich trotzdem starten.",
    );
  });

  it("shows no warning while every assigned licence is valid", async () => {
    await renderSetup();

    expect(document.querySelector(".setupwarn")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not warn about a free-text official without a licence", async () => {
    crew[0] = crewRow({ official: null, name: "Gast Schiri" });
    await renderSetup();

    expect(document.querySelector(".setupwarn")).toBeNull();
  });
});

describe("GameSetup — local crew edits", () => {
  it("keeps a changed official local until the start", async () => {
    await renderSetup();

    await userEvent.selectOptions(crewSelect("Schiedsrichter"), "13");

    expect(crewSelect("Schiedsrichter")).toHaveValue("13");
    expect(apiPutMock).not.toHaveBeenCalled();
    expect(
      within(rowFor("Schiedsrichter")).getByText("abgelaufen seit 04.03.2025"),
    ).toBeInTheDocument();
  });

  it("sends all five slots before the setup when the crew changed", async () => {
    const { onStarted } = await renderSetup();
    await userEvent.selectOptions(crewSelect("Schiedsrichter"), "13");

    await clickStart();
    // Tom Weber's licence is expired, so the first tap only confirms.
    expect(apiPutMock).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Trotzdem starten" }),
    );

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));

    expect(apiPutMock).toHaveBeenNthCalledWith(1, CREW_PATH, [
      {
        position: "Scorecard Judge",
        official: 12,
        name: "Anna Richter",
      },
      { position: "Referee", official: 13, name: "Tom Weber" },
      { position: "Down Judge", official: null, name: null },
      { position: "Field Judge", official: null, name: null },
      { position: "Side Judge", official: null, name: null },
    ]);
    expect(startCalls).toEqual([
      `PUT ${CREW_PATH}`,
      `PUT ${SETUP_PATH}`,
      `PUT ${POSSESSION_PATH}`,
      `GET ${LOG_PATH}`,
    ]);
  });

  it("leaves the officials endpoint alone when the crew is unchanged", async () => {
    await renderSetup();

    await clickStart();

    await waitFor(() => expect(startCalls).toContain(`GET ${LOG_PATH}`));
    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, expect.anything());
    expect(apiPutMock).toHaveBeenCalledWith(POSSESSION_PATH, {
      team: "Ravens",
    });
    expect(apiPutMock).not.toHaveBeenCalledWith(
      CREW_PATH,
      expect.anything(),
    );
  });
});

describe("GameSetup — crew data problems", () => {
  it("warns about a duplicate position and never writes it", async () => {
    crew = [
      crewRow({ id: 1, official: 11, position: "Referee" }),
      crewRow({
        id: 2,
        official: 12,
        name: "Anna Richter",
        position: "Referee",
      }),
      crewRow({
        id: 3,
        official: 14,
        name: "Sabine Lang",
        position: "Scorecard Judge",
      }),
    ];
    const { onStarted } = await renderSetup();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Mehrere Einträge für Schiedsrichter – bitte bereinigen",
    );
    expect(alert).toHaveTextContent("Michael Klein, Anna Richter");
    // The duplicated position cannot be counted as filled.
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", {
        name: "Schiedsrichter: Offiziellen wählen",
      }),
    ).toBeNull();
    expect(document.querySelector(".offname")).toHaveTextContent("Michael Klein");

    // Dirty via the optional Scorecard Judge; Tom Weber's licence is expired.
    await userEvent.selectOptions(crewSelect("Scorecard Judge"), "13");
    await clickStart();
    expect(apiPutMock).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Trotzdem starten" }),
    );
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));

    const crewCall = apiPutMock.mock.calls.find(
      ([path]) => path === CREW_PATH,
    );
    expect(crewCall).toBeDefined();
    const positions = (crewCall?.[1] as { position: string }[]).map(
      (row) => row.position,
    );
    expect(positions).toEqual([
      "Scorecard Judge",
      "Down Judge",
      "Field Judge",
      "Side Judge",
    ]);
  });

  it("shows and preserves an unknown position", async () => {
    crew = [
      crewRow({ id: 1, official: 11, position: "Referee" }),
      crewRow({
        id: 2,
        official: 13,
        name: "Tom Weber",
        position: "Zeitnehmer",
      }),
    ];
    const { onStarted } = await renderSetup();

    const extra = document.querySelector(".offname");
    expect(extra).toHaveTextContent("Tom Weber");
    expect(extra?.closest(".offrow")).toHaveTextContent("Zeitnehmer");

    await userEvent.selectOptions(crewSelect("Schiedsrichter"), "14");
    await clickStart();
    await userEvent.click(
      screen.getByRole("button", { name: "Trotzdem starten" }),
    );
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));

    expect(apiPutMock).toHaveBeenCalledWith(
      CREW_PATH,
      expect.arrayContaining([
        { position: "Zeitnehmer", official: 13, name: "Tom Weber" },
      ]),
    );
  });
});

describe("GameSetup — toss, possession and direction", () => {
  it("summarises the defaults", async () => {
    await renderSetup();

    expect(screen.getByText(/gewinnt den Münzwurf/)).toHaveTextContent(
      "Ravens gewinnt den Münzwurf · Ballbesitz Ravens · Richtung Ost → West",
    );
  });

  it("updates the summary when a control changes", async () => {
    await renderSetup();

    await userEvent.click(
      within(screen.getByRole("group", { name: "Münzwurf" })).getByRole(
        "button",
        { name: "Wolves" },
      ),
    );
    await userEvent.click(
      within(screen.getByRole("group", { name: "Richtung" })).getByRole(
        "button",
        { name: "West → Ost" },
      ),
    );

    expect(screen.getByText(/gewinnt den Münzwurf/)).toHaveTextContent(
      "Wolves gewinnt den Münzwurf · Ballbesitz Ravens · Richtung West → Ost",
    );
  });

  it("marks the selected segment with aria-pressed", async () => {
    await renderSetup();

    const toss = screen.getByRole("group", { name: "Münzwurf" });
    expect(within(toss).getByRole("button", { name: "Ravens" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(toss).getByRole("button", { name: "Wolves" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("labels the start button with the kick-off time", async () => {
    await renderSetup();

    expect(startButton()).toHaveTextContent("Spiel starten · 13:30");
    expect(startButton()).toBeEnabled();
  });
});

describe("GameSetup — start sequence", () => {
  it("sends the defaults and the device id once, then loads the log", async () => {
    const { onStarted } = await renderSetup();

    await clickStart();

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));

    expect(getDeviceIdMock).toHaveBeenCalledTimes(1);
    expect(setDeviceIdMock).toHaveBeenCalledTimes(1);
    expect(setDeviceIdMock).toHaveBeenCalledWith("device-1");
    expect(apiPutMock).toHaveBeenCalledTimes(2);
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, {
      ctResult: "home",
      direction: "Ost",
      fhPossession: "home",
      device_id: "device-1",
    });
    expect(apiPutMock).toHaveBeenCalledWith(POSSESSION_PATH, {
      team: "Ravens",
    });
    expect(startCalls).toEqual([
      `PUT ${SETUP_PATH}`,
      `PUT ${POSSESSION_PATH}`,
      `GET ${LOG_PATH}`,
    ]);
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it("sends the chosen toss, possession and direction", async () => {
    await renderSetup();

    await userEvent.click(
      within(screen.getByRole("group", { name: "Münzwurf" })).getByRole(
        "button",
        { name: "Wolves" },
      ),
    );
    await userEvent.click(
      within(screen.getByRole("group", { name: "Erster Ballbesitz" })).getByRole(
        "button",
        { name: "Wolves" },
      ),
    );
    await userEvent.click(
      within(screen.getByRole("group", { name: "Richtung" })).getByRole(
        "button",
        { name: "West → Ost" },
      ),
    );
    await clickStart();

    await waitFor(() => expect(startCalls).toContain(`GET ${LOG_PATH}`));
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, {
      ctResult: "away",
      direction: "West",
      fhPossession: "away",
      device_id: "device-1",
    });
    expect(apiPutMock).toHaveBeenCalledWith(POSSESSION_PATH, {
      team: "Wolves",
    });
  });

  it("shows an existing setup as Fortsetzen and restores its values", async () => {
    setup = { ctResult: "away", direction: "West", fhPossession: "away" };
    await renderSetup();

    expect(startButton()).toHaveTextContent("Fortsetzen");
    expect(screen.getByText(/gewinnt den Münzwurf/)).toHaveTextContent(
      "Wolves gewinnt den Münzwurf · Ballbesitz Wolves · Richtung West → Ost",
    );
    expect(
      within(screen.getByRole("group", { name: "Richtung" })).getByRole(
        "button",
        { name: "West → Ost" },
      ),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("maps the legacy toss relative to the away side", async () => {
    // v1 recorded "Gewonnen" for the away team's coin-toss call.
    setup = {
      ctResult: "Gewonnen",
      direction: "directionRight",
      fhPossession: "Wolves",
    };
    await renderSetup();

    expect(startButton()).toHaveTextContent("Fortsetzen");
    expect(screen.getByText(/gewinnt den Münzwurf/)).toHaveTextContent(
      "Wolves gewinnt den Münzwurf · Ballbesitz Wolves · Richtung West → Ost",
    );
  });

  it("maps a lost legacy toss to the home side", async () => {
    setup = {
      ctResult: "Verloren",
      direction: "arrow_forward",
      fhPossession: "Ravens",
    };
    await renderSetup();

    expect(screen.getByText(/gewinnt den Münzwurf/)).toHaveTextContent(
      "Ravens gewinnt den Münzwurf · Ballbesitz Ravens · Richtung West → Ost",
    );
  });

  it("disables the button while the start is in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    apiPutMock.mockImplementation(async (path: string) => {
      if (path === SETUP_PATH) {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return [];
    });
    const { onStarted } = await renderSetup();

    await clickStart();

    expect(startButton()).toBeDisabled();
    expect(startButton()).toHaveTextContent("Startet …");
    release({});
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
  });
});

describe("GameSetup — start failures and guards", () => {
  it("does not start when saving the crew is rejected", async () => {
    const { onStarted } = await renderSetup();
    await userEvent.selectOptions(crewSelect("Schiedsrichter"), "14");
    crewFailure = new ApiError(
      400,
      { detail: "Offizielle konnten nicht gespeichert werden." },
      "Offizielle konnten nicht gespeichert werden.",
    );

    await clickStart();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Offizielle konnten nicht gespeichert werden.",
    );
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(CREW_PATH, expect.anything());
    expect(setDeviceIdMock).not.toHaveBeenCalled();
    expect(startCalls).toEqual([`PUT ${CREW_PATH}`]);

    crewFailure = null;
    await clickStart();

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, expect.anything());
  });

  it("retries only the log after the setup was accepted", async () => {
    let logCalls = 0;
    apiGetMock.mockImplementation(async (path: string) => {
      switch (path) {
        case CREW_PATH:
          return crew;
        case TEAM_PATH:
          return teamList;
        case SETUP_PATH:
          return setup;
        case LOG_PATH: {
          logCalls += 1;
          startCalls.push(`GET ${path}`);
          if (logCalls === 1) {
            throw new ApiError(500, null);
          }
          return LOG;
        }
        default:
          throw new Error(`unexpected GET ${path}`);
      }
    });
    const { onStarted } = await renderSetup();

    await clickStart();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    );
    expect(startButton()).toHaveTextContent("Fortsetzen");
    expect(startCalls).toEqual([
      `PUT ${SETUP_PATH}`,
      `PUT ${POSSESSION_PATH}`,
      `GET ${LOG_PATH}`,
    ]);

    await clickStart();

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
    expect(startCalls).toEqual([
      `PUT ${SETUP_PATH}`,
      `PUT ${POSSESSION_PATH}`,
      `GET ${LOG_PATH}`,
      `GET ${LOG_PATH}`,
    ]);
    expect(
      apiPutMock.mock.calls.filter(([path]) => path === SETUP_PATH),
    ).toHaveLength(1);
  });

  it("ignores a second tap while the start is in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    apiPutMock.mockImplementation(async (path: string) => {
      if (path === SETUP_PATH) {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      if (path === POSSESSION_PATH) {
        return undefined;
      }
      return [];
    });
    const { onStarted } = await renderSetup();

    fireEvent.click(startButton());
    fireEvent.click(startButton());

    await waitFor(() => expect(apiPutMock).toHaveBeenCalledTimes(1));
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, expect.anything());
    release({});
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
  });

  it("shows a finished game as a notice without a start button", async () => {
    const { onStarted } = await renderSetup({ status: "beendet" });

    expect(screen.getByText("Dieses Spiel ist beendet.")).toBeInTheDocument();
    expect(document.querySelector(".startbtn")).toBeNull();
    expect(crewSelect("Schiedsrichter")).toBeDisabled();
    expect(
      within(screen.getByRole("group", { name: "Richtung" })).getByRole(
        "button",
        { name: "Ost → West" },
      ),
    ).toBeDisabled();
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe("GameSetup — warn and confirm", () => {
  it("requires a second tap before starting with an invalid licence", async () => {
    teamList[0] = teamPerson({ is_valid: false, valid_until: "2025-03-04" });
    const { onStarted } = await renderSetup();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Das Spiel lässt sich trotzdem starten.",
    );
    expect(startButton()).toHaveAttribute(
      "aria-describedby",
      "crew-licence-warning",
    );

    await clickStart();

    expect(apiPutMock).not.toHaveBeenCalled();
    expect(startCalls).toEqual([]);
    expect(startButton()).toHaveTextContent("Trotzdem starten");
    // The confirm step is a live region, not just a relabelled button.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lizenz nicht gültig – erneut tippen zum Start.",
    );

    await clickStart();

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
    expect(apiPutMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after the crew or the setup changed", async () => {
    teamList[0] = teamPerson({ is_valid: false, valid_until: "2025-03-04" });
    await renderSetup();

    await clickStart();
    expect(startButton()).toHaveTextContent("Trotzdem starten");

    await userEvent.click(
      within(screen.getByRole("group", { name: "Richtung" })).getByRole(
        "button",
        { name: "West → Ost" },
      ),
    );

    expect(startButton()).toHaveTextContent("Spiel starten · 13:30");
    expect(apiPutMock).not.toHaveBeenCalled();
  });
});

describe("GameSetup — passcheck", () => {
  it("shows a complete passcheck with the link to its page", async () => {
    await renderSetup({ passcheck: true });

    expect(screen.getByText("Passcheck vollständig")).toHaveClass("okchip");
    const link = screen.getByRole("link", { name: "Passcheck-Seite" });
    expect(link).toHaveAttribute("href", "/passcheck/");
    // A new tab keeps unsaved crew edits on this screen alive.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/neuer Tab/)).toBeInTheDocument();
  });

  it("shows a missing passcheck", async () => {
    await renderSetup({ passcheck: false });

    expect(screen.getByText("kein Passcheck")).toHaveClass("chip-miss");
  });

  it("shows an unknown passcheck when the payload omits it", async () => {
    const game = { ...GAME };
    delete game.passcheck;
    render(<GameSetupScreen game={game} onStarted={vi.fn()} />);
    await screen.findByRole("group", { name: "Münzwurf" });

    expect(screen.getByText("unbekannt")).toBeInTheDocument();
  });
});

describe("GameSetup — server rejections", () => {
  const statusMessage = "Dieser Spielstatus erlaubt keinen Spielstart.";
  const deviceMessage = "Dieses Spiel läuft auf einem anderen Gerät.";

  it("shows the server detail for an illegal transition", async () => {
    setupFailure = new ApiError(409, { detail: statusMessage }, statusMessage);
    const { onStarted } = await renderSetup();

    await clickStart();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(statusMessage);
    expect(startCalls).toEqual([`PUT ${SETUP_PATH}`]);
    expect(onStarted).not.toHaveBeenCalled();
    expect(startButton()).toBeEnabled();
  });

  it("switches to read-only when another device owns the game", async () => {
    setupFailure = new ApiError(409, { detail: deviceMessage }, deviceMessage);
    await renderSetup();

    await clickStart();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(deviceMessage);
    expect(crewSelect("Schiedsrichter")).toBeDisabled();
    for (const group of screen.getAllByRole("group")) {
      for (const button of within(group).getAllByRole("button")) {
        expect(button).toBeDisabled();
      }
    }
    expect(startButton()).toBeDisabled();
    expect(startButton()).toHaveTextContent("Nur lesen");
    expect(setDeviceIdMock).not.toHaveBeenCalled();
  });

  it("classifies the device lock by the server's device_id", async () => {
    setupFailure = new ApiError(
      409,
      { detail: "Konflikt beim Start.", device_id: "device-2" },
      "Konflikt beim Start.",
    );
    await renderSetup();

    await clickStart();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Konflikt beim Start.");
    expect(startButton()).toHaveTextContent("Nur lesen");
    expect(crewSelect("Schiedsrichter")).toBeDisabled();
  });

  it("offers a retry after the device lock was released", async () => {
    setupFailure = new ApiError(
      409,
      { detail: deviceMessage, device_id: "device-2" },
      deviceMessage,
    );
    const { onStarted } = await renderSetup();

    await clickStart();
    expect(startButton()).toHaveTextContent("Nur lesen");

    // Staff released the lock; the same attempt must be possible again.
    setupFailure = null;
    await userEvent.click(
      screen.getByRole("button", { name: "Erneut prüfen" }),
    );

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
    expect(
      apiPutMock.mock.calls.filter(([path]) => path === SETUP_PATH),
    ).toHaveLength(2);
    expect(startButton()).not.toBeDisabled();
  });

  it("falls back to a readable message for other failures", async () => {
    setupFailure = new ApiError(500, null);
    await renderSetup();

    await clickStart();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    );
    expect(startButton()).toBeEnabled();
  });
});

describe("GameSetup — loading", () => {
  it("shows a readable error and retries the load", async () => {
    apiGetMock.mockRejectedValue(new ApiError(500, null));
    render(<GameSetupScreen game={GAME} onStarted={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Die Vorbereitung konnte nicht geladen werden.",
    );

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === CREW_PATH) {
        return crew;
      }
      if (path === TEAM_PATH) {
        return teamList;
      }
      if (path === SETUP_PATH) {
        return {};
      }
      throw new Error(`unexpected GET ${path}`);
    });
    await userEvent.click(
      within(alert).getByRole("button", { name: "Erneut laden" }),
    );

    expect(
      await screen.findByRole("group", { name: "Münzwurf" }),
    ).toBeInTheDocument();
  });

  it("keeps the screen usable when the officials team list fails", async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === CREW_PATH) {
        return crew;
      }
      if (path === TEAM_PATH) {
        throw new ApiError(500, null);
      }
      if (path === SETUP_PATH) {
        return {};
      }
      throw new Error(`unexpected GET ${path}`);
    });
    render(<GameSetupScreen game={GAME} onStarted={vi.fn()} />);

    await screen.findByRole("group", { name: "Münzwurf" });

    expect(
      screen.getByText("Die Offiziellen des Teams konnten nicht geladen werden."),
    ).toBeInTheDocument();
    // Without the team list an assigned official cannot be judged; showing
    // "keine Lizenz" would be a claim the screen cannot make.
    expect(within(rowFor("Schiedsrichter")).getByText("Lizenz unbekannt"))
      .toHaveClass("lic-unknown");
    expect(document.querySelector(".setupwarn")).toBeNull();
    expect(startButton()).toBeEnabled();
  });
});
