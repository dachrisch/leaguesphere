import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import StartConfirmation, {
  startBlockers,
  type StartCrewLine,
  type StartFacts,
} from "./StartConfirmation";

function crewLine(overrides: Partial<StartCrewLine> = {}): StartCrewLine {
  const line: StartCrewLine = {
    label: "Schiedsrichter",
    name: "Michael Klein",
    filled: true,
    freetext: false,
    required: true,
    editable: true,
    duplicate: false,
    ...overrides,
  };
  // `filled` is the slot's own state, not the resolved name: a linked official
  // the team list cannot resolve has no name and is still a filled slot.
  return {
    ...line,
    filled:
      overrides.filled ?? (line.name !== null && line.name.trim() !== ""),
  };
}

function facts(overrides: Partial<StartFacts> = {}): StartFacts {
  return {
    crew: [crewLine()],
    tossTeam: "Ravens",
    possessionTeam: "Ravens",
    direction: "Ost",
    ...overrides,
  };
}

function baseProps() {
  return {
    ...facts(),
    home: "Ravens",
    away: "Wolves",
    time: "13:30",
    field: 2,
    passcheck: true,
    licenceIssues: [],
    onStart: vi.fn(),
    onClose: vi.fn(),
  };
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "Spiel starten" });
}

describe("startBlockers", () => {
  it("accepts a complete preparation", () => {
    expect(startBlockers(facts())).toEqual([]);
  });

  it("refuses an empty slot the league counts as required", () => {
    expect(
      startBlockers(facts({ crew: [crewLine({ name: null })] })),
    ).toEqual([
      "Offizielle: Schiedsrichter fehlt – die Liga verlangt diese Position.",
    ]);
  });

  it("accepts an empty slot the league does not require", () => {
    expect(
      startBlockers(
        facts({ crew: [crewLine({ name: null, required: false })] }),
      ),
    ).toEqual([]);
  });

  it("restates a required slot the screen cannot edit without blocking on it", () => {
    // The operator cannot fix a duplicate or an unknown position here, so the
    // slot is restated but never becomes the reason a start is refused.
    expect(
      startBlockers(
        facts({
          crew: [crewLine({ name: null, filled: false, editable: false })],
        }),
      ),
    ).toEqual([]);
  });

  it("does not block on a linked official whose name could not be resolved", () => {
    // The team list failed (or the row carries no name): the screen counts the
    // slot as filled and the picker says "Offizieller 99". The sheet must agree,
    // or a fully crewed gameday could not be started at all.
    expect(
      startBlockers(
        facts({ crew: [crewLine({ name: null, filled: true })] }),
      ),
    ).toEqual([]);
  });

  it("only blocks a one-token free text where the league requires the slot", () => {
    expect(
      startBlockers(
        facts({
          crew: [
            crewLine({ name: "Michael Klein" }),
            crewLine({
              label: "Zeitnehmer",
              name: "N.N.",
              freetext: true,
              required: false,
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("never blocks on a duplicated position", () => {
    expect(
      startBlockers(
        facts({
          crew: [crewLine({ duplicate: true, editable: false, filled: false })],
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a free-text name without a first and a last name", () => {
    expect(
      startBlockers(
        facts({
          crew: [crewLine({ name: "Schiri", freetext: true })],
          tossTeam: null,
        }),
      ),
    ).toEqual([
      "Offizielle: Schiedsrichter – Freitextname „Schiri“ braucht Vor- und Nachnamen.",
      "Münzwurf gewonnen von: keine Mannschaft gewählt.",
    ]);
  });

  it("accepts a free-text name with two name parts", () => {
    expect(
      startBlockers(
        facts({ crew: [crewLine({ name: "Gast Schiri", freetext: true })] }),
      ),
    ).toEqual([]);
  });

  it("refuses an unset toss, possession or direction", () => {
    expect(
      startBlockers(
        facts({ tossTeam: null, possessionTeam: null, direction: null }),
      ),
    ).toEqual([
      "Münzwurf gewonnen von: keine Mannschaft gewählt.",
      "Erster Ballbesitz: keine Mannschaft gewählt.",
      "Spielrichtung: keine Seite gewählt.",
    ]);
  });
});

describe("StartConfirmation — what it restates", () => {
  it("restates the teams, when and where the game starts", () => {
    render(<StartConfirmation {...baseProps()} />);

    const sheet = within(dialog());
    expect(sheet.getByText("Ravens – Wolves")).toBeInTheDocument();
    expect(sheet.getByText("13:30 · Feld 2")).toBeInTheDocument();
  });

  it("says that starting writes the setup and that no clock runs", () => {
    render(<StartConfirmation {...baseProps()} />);

    expect(dialog()).toHaveTextContent(
      "Der Start schreibt die Vorbereitung und sperrt das Spiel für dieses Gerät.",
    );
    expect(dialog()).toHaveTextContent("Eine Spieluhr läuft in der App nicht.");
  });

  it("lists the crew with the league's labels and marks an empty required slot", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        crew={[
          crewLine({ label: "Head Referee", name: "Michael Klein" }),
          crewLine({ label: "Linienrichter", name: null }),
          crewLine({
            label: "Protokoll",
            name: null,
            required: false,
          }),
        ]}
      />,
    );

    const rows = Array.from(dialog().querySelectorAll(".startrow")).map(
      (row) => row.textContent,
    );
    expect(rows).toContain(
      "Head RefereeMichael Klein",
    );
    // A required empty slot is named as missing, an optional one as not needed.
    expect(rows).toContain("Linienrichterfehlt");
    expect(rows).toContain("Protokollnicht nötig");
  });

  it("shows a filled slot without a resolvable name as entered, not missing", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        crew={[crewLine({ name: null, filled: true })]}
      />,
    );

    expect(dialog()).toHaveTextContent("eingetragen");
    expect(
      within(dialog()).queryByRole("button", { name: "Angaben fehlen" }),
    ).toBeNull();
    // "fehlt" would be a claim about a slot that is filled.
    expect(
      within(dialog()).queryByText("fehlt", { selector: ".startmiss" }),
    ).toBeNull();
  });

  it("names a duplicated position as information without blocking", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        crew={[crewLine({ duplicate: true, editable: false })]}
      />,
    );

    expect(dialog()).toHaveTextContent(
      "Offizielle: Schiedsrichter ist doppelt belegt.",
    );
    expect(
      within(dialog()).getByRole("button", { name: "Jetzt starten" }),
    ).toBeEnabled();
  });

  it("marks a crew member who is only stored as free text", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        crew={[crewLine({ name: "Gast Schiri", freetext: true })]}
      />,
    );

    expect(dialog()).toHaveTextContent("Gast Schiri");
    expect(dialog()).toHaveTextContent("Freitext");
  });

  it("restates the toss, the first possession and the direction", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        tossTeam="Wolves"
        possessionTeam="Ravens"
        direction="West"
      />,
    );

    const sheet = within(dialog());
    expect(sheet.getByText("Wolves")).toBeInTheDocument();
    const directionRow = Array.from(
      dialog().querySelectorAll(".startrow"),
    ).find((row) => row.textContent?.startsWith("Spielrichtung"));
    expect(directionRow).toHaveTextContent("West");
    expect(directionRow).toHaveTextContent("Ost");
    // The arrow is drawn: the character is an sr-only text alternative.
    expect(directionRow?.querySelector(".dirarrow")).not.toBeNull();
  });

  it("shows the passcheck state in all three shapes", () => {
    const { unmount } = render(
      <StartConfirmation {...baseProps()} passcheck={true} />,
    );
    expect(dialog()).toHaveTextContent("Passcheckvollständig");
    unmount();

    const second = render(
      <StartConfirmation {...baseProps()} passcheck={false} />,
    );
    expect(dialog()).toHaveTextContent("Passcheckfehlt");
    second.unmount();

    render(<StartConfirmation {...baseProps()} passcheck={undefined} />);
    expect(dialog()).toHaveTextContent("Passcheckunbekannt");
  });

  it("carries the licence warning instead of adding a step", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        licenceIssues={[
          { name: "Michael Klein", role: "Schiedsrichter" },
          { name: "Anna Richter", role: "Scorecard Judge" },
        ]}
      />,
    );

    const sheet = within(dialog());
    expect(sheet.getByText("2 Lizenzen sind nicht gültig")).toBeInTheDocument();
    expect(
      sheet.getByText(
        "Michael Klein (Schiedsrichter), Anna Richter (Scorecard Judge)",
      ),
    ).toBeInTheDocument();
    expect(
      sheet.getByText("Das Spiel lässt sich trotzdem starten."),
    ).toBeInTheDocument();
    // The confirmation carries the warning: the next tap does start.
    expect(sheet.getByRole("button", { name: "Trotzdem starten" })).toBeEnabled();
  });
});

describe("StartConfirmation — refusing and confirming", () => {
  it("lists the reasons and disables the start while input is missing", () => {
    render(
      <StartConfirmation
        {...baseProps()}
        crew={[crewLine({ name: null })]}
        tossTeam={null}
      />,
    );

    const sheet = within(dialog());
    const blockers = dialog().querySelector("#start-blockers");
    expect(blockers).toHaveTextContent("Start nicht möglich");
    expect(blockers).toHaveTextContent(
      "Offizielle: Schiedsrichter fehlt – die Liga verlangt diese Position.",
    );
    expect(blockers).toHaveTextContent("Münzwurf gewonnen von: keine Mannschaft gewählt.");

    // A long sheet scrolls: the reasons must be the first thing after the lead
    // sentence, not the last block below the fold, and they are announced.
    expect(sheet.getByRole("alert")).toHaveTextContent("Start nicht möglich");
    expect(blockers?.nextElementSibling).toHaveClass("sheetsection");

    const action = sheet.getByRole("button", { name: "Angaben fehlen" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-describedby", "start-blockers");
  });

  it("confirms with one tap once every input is there", async () => {
    const onStart = vi.fn();
    render(<StartConfirmation {...baseProps()} onStart={onStart} />);

    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Jetzt starten" }),
    );

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("closes without confirming", async () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <StartConfirmation {...baseProps()} onClose={onClose} onStart={onStart} />,
    );

    await userEvent.click(
      within(dialog()).getByRole("button", { name: "Schließen" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("puts what needs attention above the summary", () => {
    render(<StartConfirmation {...baseProps()} passcheck={false} />);

    const sheet = dialog();
    const attention = within(sheet).getByRole("status", { name: "Bitte beachten" });
    expect(attention).toHaveTextContent("Passcheck fehlt");
    const summary = within(sheet).getByText("Begegnung");
    expect(attention.compareDocumentPosition(summary)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("has nothing to point out when the passcheck passed and every licence is valid", () => {
    render(<StartConfirmation {...baseProps()} passcheck />);

    expect(within(dialog()).queryByRole("status", { name: "Bitte beachten" })).toBeNull();
  });
});
