import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Official, TeamOfficial } from "../../api/types";
import { sideTeam, type CrewSlot } from "./crew";
import { useCrewSetup } from "./useCrewSetup";

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

const person = (over: Partial<TeamOfficial> = {}): TeamOfficial => ({
  id: 7,
  first_name: "Ada",
  last_name: "Lovelace",
  team: "Home",
  license: "F1",
  valid_until: "2027-01-02",
  is_valid: true,
  ...over,
});

const row = (over: Partial<Official> = {}): Official => ({
  id: 1,
  official: null,
  name: null,
  position: "Referee",
  ...over,
});

function useHarness(initial: CrewSlot[], teamOfficials: TeamOfficial[]) {
  const [slots, setSlots] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const crew = useCrewSetup({ slots, setSlots, teamOfficials, setDirty });
  return { ...crew, slots, dirty };
}

describe("useCrewSetup (Phase 3 characterization)", () => {
  it("classifies every licence state a slot can carry", () => {
    const { result } = renderHook(() =>
      useHarness([], [
        person(),
        person({ id: 8, license: null, is_valid: false, valid_until: null }),
        person({ id: 9, license: "F2", is_valid: false, valid_until: null }),
        person({ id: 10, license: "F3", is_valid: false, valid_until: "2026-01-01" }),
      ]),
    );
    const { licenceOf } = result.current;
    expect(licenceOf(slot())).toEqual({ state: "empty", label: "fehlt" });
    expect(licenceOf(slot({ name: "Guest" }))).toEqual({
      state: "missing",
      label: "keine Lizenz",
    });
    expect(licenceOf(slot({ official: 99 }))).toEqual({
      state: "unknown",
      label: "Lizenz unbekannt",
    });
    expect(licenceOf(slot({ official: 8 }))).toEqual({
      state: "missing",
      label: "keine Lizenz",
    });
    expect(licenceOf(slot({ official: 7 }))).toEqual({
      state: "valid",
      label: "F1 gültig",
    });
    expect(licenceOf(slot({ official: 9 }))).toEqual({
      state: "expired",
      label: "F2 abgelaufen",
    });
    expect(licenceOf(slot({ official: 10 }))).toEqual({
      state: "expired",
      label: "F3 abgelaufen seit 01.01.2026",
    });
    // A licence carried by the row itself wins over the team directory.
    expect(
      licenceOf(
        slot({
          official: 7,
          licence: { license: "F4", validUntil: null, isValid: false },
        }),
      ),
    ).toEqual({ state: "expired", label: "F4 abgelaufen" });
  });

  it("reports issues and warnings only for linked expired or missing licences", () => {
    const { result } = renderHook(() =>
      useHarness(
        [
          slot({ official: null, name: "Guest" }),
          slot({ official: 7, label: "Referee" }),
          slot({ official: 8, label: "Down Judge" }),
          slot({
            official: 99,
            label: "Ghost",
            licence: { license: null, validUntil: null, isValid: false },
          }),
        ],
        [person(), person({ id: 8, license: null, valid_until: null, is_valid: false })],
      ),
    );
    expect(result.current.licenceIssues).toEqual([
      { name: "Ada Lovelace", role: "Down Judge" },
      { name: "Unbekannt", role: "Ghost" },
    ]);
    expect(result.current.licenceWarns(slot())).toBe(false);
    expect(result.current.licenceWarns(slot({ official: 7 }))).toBe(false);
    expect(result.current.licenceWarns(slot({ official: 8 }))).toBe(true);
  });

  it("counts only filled, non-duplicate required slots and orders optional ones", () => {
    const { result } = renderHook(() =>
      useHarness(
        [
          slot({ position: "r1", official: 7 }),
          slot({ position: "r2", duplicate: true, official: 8 }),
          slot({ position: "r3", name: "  " }),
          slot({ position: "o1", required: false, official: 9 }),
          slot({ position: "o2", required: false, name: "Guest" }),
          slot({ position: "o3", required: false }),
          slot({ position: "x1", known: false, required: false }),
        ],
        [],
      ),
    );
    expect(result.current.requiredSlots).toHaveLength(3);
    expect(result.current.requiredFilled).toBe(1);
    expect(result.current.orderedSlots.map(({ slot: item }) => item.position)).toEqual([
      "r1",
      "r2",
      "r3",
      "o1",
      "o2",
      "o3",
      "x1",
    ]);
    expect(result.current.orderedSlots[0].index).toBe(0);
  });

  it("edits the addressed slot, marks the crew dirty and builds the wire payload", () => {
    const { result } = renderHook(() =>
      useHarness(
        [
          slot({ official: 7 }),
          slot({ position: "d1", official: null, name: "  Guest  ", duplicate: true }),
        ],
        [person()],
      ),
    );
    expect(result.current.crewPayload).toEqual([
      { position: "Referee", official: 7, name: "Ada Lovelace" },
    ]);
    expect(result.current.crewLines[0]).toEqual({
      label: "Schiedsrichter",
      name: "Ada Lovelace",
      filled: true,
      freetext: false,
      required: true,
      editable: true,
      duplicate: false,
    });
    expect(result.current.crewLines[1]).toMatchObject({
      filled: true,
      freetext: true,
      editable: false,
      duplicate: true,
    });

    act(() => result.current.pickPerson(1, person({ id: 11, first_name: "Grace" })));
    expect(result.current.slots[1].official).toBe(11);
    expect(result.current.slots[1].licence).toEqual({
      license: "F1",
      validUntil: "2027-01-02",
      isValid: true,
    });
    expect(result.current.dirty).toBe(true);

    act(() => result.current.enterFreeText(0, " Guest "));
    expect(result.current.slots[0]).toMatchObject({ official: null, name: " Guest ", licence: null });
    act(() => result.current.clearSlot(0));
    expect(result.current.slots[0]).toMatchObject({ official: null, name: null, licence: null });
    act(() => result.current.enterFreeText(5, "Nowhere"));
    act(() => result.current.clearSlot(5));
    act(() => result.current.pickPerson(5, person()));
    act(() => result.current.clearSlot(5));
    expect(result.current.slots).toHaveLength(2);

    const { result: free } = renderHook(() =>
      useHarness([slot({ official: null, name: " Free Text " })], []),
    );
    expect(free.current.crewPayload[0].name).toBe("Free Text");
    expect(free.current.crewLines[0].name).toBe("Free Text");
    expect(free.current.crewLines[0].freetext).toBe(true);
    const { result: blank } = renderHook(() => useHarness([slot()], []));
    expect(blank.current.crewPayload[0].name).toBeNull();
    expect(blank.current.crewLines[0].filled).toBe(false);
    const { result: named } = renderHook(() =>
      useHarness([slot({ official: 7, name: "stale" })], [person()]),
    );
    expect(named.current.crewPayload[0].name).toBe("Ada Lovelace");
  });

  it("collects officials used by other rows without duplicating them", () => {
    const { result } = renderHook(() =>
      useHarness(
        [
          slot({ official: 7 }),
          slot({
            position: "o1",
            rows: [row({ official: 8 }), row({ official: null })],
          }),
          slot({ position: "o2", official: 8 }),
        ],
        [],
      ),
    );
    expect([...result.current.takenByOthers(0)].sort()).toEqual([8]);
    expect([...result.current.takenByOthers(1)].sort()).toEqual([7, 8]);
    expect([...result.current.takenByOthers(2)].sort()).toEqual([7, 8]);
  });

  it("maps a saved side to the right team", () => {
    expect(sideTeam("home", "Lions", "Centurions")).toBe("Lions");
    expect(sideTeam("away", "Lions", "Centurions")).toBe("Centurions");
  });
});
