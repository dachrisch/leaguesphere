import { describe, expect, it } from "vitest";

import type { CrewSlot } from "./crew";
import { crewProgress, startLabel, startReady, startState } from "./start";

const slot = (over: Partial<CrewSlot> = {}): CrewSlot => ({
  position: "Referee",
  label: "Schiedsrichter",
  required: true,
  rows: [],
  official: null,
  name: null,
  known: true,
  duplicate: false,
  licence: null,
  ...over,
});

describe("startLabel (Phase 3 characterization)", () => {
  it("renders all five start-bar states", () => {
    expect(startLabel(true, true, true, true, "13:30:00")).toBe("Nur lesen");
    expect(startLabel(false, true, true, true, "13:30:00")).toBe("Start nur online");
    expect(startLabel(false, false, true, true, "13:30:00")).toBe("Startet …");
    expect(startLabel(false, false, false, true, "13:30:00")).toBe("Fortsetzen");
    expect(startLabel(false, false, false, false, "13:30:00")).toContain("Spiel starten");
  });
});

describe("crewProgress (Phase 3 characterization)", () => {
  const line = (over: { freetext?: boolean } = {}) => ({
    label: "p",
    name: null,
    filled: false,
    freetext: false,
    required: true,
    editable: true,
    duplicate: false,
    ...over,
  });

  it("needs a required slot, filled rows, valid licences and no data problems", () => {
    const base = {
      requiredSlots: [slot({ official: 7 })],
      requiredFilled: 1,
      licenceIssues: [],
      slots: [slot({ official: 7 })],
      crewLines: [line()],
      crewOpen: false,
      displayName: (item: CrewSlot) => (item.official === 7 ? "Ada" : null),
    };
    expect(crewProgress(base)).toEqual({
      crewComplete: true,
      crewFolded: true,
      crewNames: ["Ada"],
      counter: "1/1 besetzt",
    });
    expect(crewProgress({ ...base, requiredSlots: [] }).counter).toBe(
      "keine Pflichtposition",
    );
    expect(crewProgress({ ...base, requiredFilled: 0 }).crewComplete).toBe(false);
    expect(crewProgress({ ...base, licenceIssues: [{ name: "A", role: "p" }] }).crewComplete).toBe(false);
    expect(crewProgress({ ...base, slots: [slot({ duplicate: true })] }).crewComplete).toBe(false);
    expect(crewProgress({ ...base, slots: [slot({ known: false })] }).crewComplete).toBe(false);
    expect(crewProgress({ ...base, crewLines: [line({ freetext: true })] }).crewComplete).toBe(false);
    expect(crewProgress({ ...base, crewOpen: true }).crewFolded).toBe(false);
    expect(
      crewProgress({ ...base, displayName: () => "   " }).crewNames,
    ).toEqual([]);
    expect(crewProgress({ ...base, displayName: () => null }).crewNames).toEqual([]);
  });
});

describe("startState (Phase 3 characterization)", () => {
  it("explains why a start is blocked in every banner state", () => {
    expect(startState({ readOnly: true, error: "lock", offline: true, ready: true, blockers: [] })).toEqual({
      banner: { tone: "miss", title: "Nur lesen", lines: ["lock"] },
      openItems: [],
      startWhy: null,
    });
    expect(startState({ readOnly: true, error: null, offline: false, ready: false, blockers: [] }).banner).toEqual({
      tone: "miss",
      title: "Nur lesen",
      lines: ["Dieses Spiel läuft auf einem anderen Gerät."],
    });
    expect(startState({ readOnly: false, error: null, offline: true, ready: true, blockers: [] }).banner).toEqual({
      tone: "miss",
      title: "Start nur online",
      lines: ["Das Spiel kann nur mit Verbindung gestartet werden."],
    });
    expect(startState({ readOnly: false, error: null, offline: false, ready: true, blockers: [] }).banner).toEqual({
      tone: "ok",
      title: "Bereit zum Starten",
      lines: ["Alle Pflichtangaben sind gesetzt."],
    });
    const blocked = startState({
      readOnly: false,
      error: null,
      offline: false,
      ready: false,
      blockers: ["Münzwurf", "Ballbesitz"],
    });
    expect(blocked.banner).toEqual({
      tone: "miss",
      title: "Angaben fehlen",
      lines: ["Münzwurf", "Ballbesitz"],
    });
    expect(blocked.startWhy).toBe("Noch offen: Münzwurf (+1 weitere)");
    expect(
      startState({ readOnly: false, error: null, offline: false, ready: false, blockers: ["Münzwurf"] })
        .startWhy,
    ).toBe("Noch offen: Münzwurf");
    expect(
      startState({ readOnly: false, error: null, offline: true, ready: false, blockers: ["Münzwurf"] })
        .openItems,
    ).toEqual([]);
  });
});

describe("startReady (Phase 3 characterization)", () => {
  it("is ready only without blockers", () => {
    expect(startReady([])).toBe(true);
    expect(startReady(["Münzwurf"])).toBe(false);
  });
});
