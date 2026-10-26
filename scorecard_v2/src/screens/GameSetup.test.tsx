import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { apiGet, apiPut, setDeviceId } from "../api/client";
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
  ];
  setup = {};
  startCalls = [];
  setupFailure = null;

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
    if (path === SETUP_PATH && setupFailure !== null) {
      throw setupFailure;
    }
    if (path === SETUP_PATH) {
      return { ...(body as GameSetup) };
    }
    if (path === CREW_PATH) {
      return [];
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
    expect(screen.getByText("2/5")).toBeInTheDocument();
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

  it("maps a legacy 'Schiedsrichter' position onto the Referee slot", async () => {
    crew = [crewRow({ position: "Schiedsrichter" })];
    await renderSetup();

    expect(crewSelect("Schiedsrichter")).toHaveValue("11");
    expect(screen.getByText("1/5")).toBeInTheDocument();
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
      `GET ${LOG_PATH}`,
    ]);
  });

  it("leaves the officials endpoint alone when the crew is unchanged", async () => {
    await renderSetup();

    await clickStart();

    await waitFor(() => expect(startCalls).toContain(`GET ${LOG_PATH}`));
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(apiPutMock).toHaveBeenCalledWith(SETUP_PATH, expect.anything());
  });
});
describe("GameSetup — warn and confirm", () => {
  it("requires a second tap before starting with an invalid licence", async () => {
    teamList[0] = teamPerson({ is_valid: false, valid_until: "2025-03-04" });
    const { onStarted } = await renderSetup();

    await clickStart();

    expect(apiPutMock).not.toHaveBeenCalled();
    expect(startCalls).toEqual([]);
    expect(startButton()).toHaveTextContent("Trotzdem starten");
    expect(document.querySelector(".setupwarn")).toHaveTextContent(
      "Das Spiel lässt sich trotzdem starten.",
    );

    await clickStart();

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(LOG));
    expect(apiPutMock).toHaveBeenCalledTimes(1);
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

