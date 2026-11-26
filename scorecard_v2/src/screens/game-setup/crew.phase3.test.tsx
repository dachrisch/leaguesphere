import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { CrewPosition, Official, TeamOfficial } from "../../api/types";
import {
  Segmented,
  carriesDeviceId,
  describeStartError,
  formatLicenceDate,
  hasSavedSetup,
  licenceOfPerson,
  licenceOfRow,
  normaliseSide,
  normaliseToss,
  personName,
  rowDisplayName,
  slotHasValue,
  slotsFromCrew,
  teamLabel,
} from "../GameSetup";

const official = (over: Partial<Official> = {}): Official => ({
  id: 1,
  official: null,
  name: null,
  position: "Referee",
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

const position = (over: Partial<CrewPosition> = {}): CrewPosition => ({
  position: "Referee",
  label: "Schiedsrichter",
  order: 1,
  required: true,
  ...over,
});

describe("licence facts (Phase 3 characterization)", () => {
  it("treats an absent row and an all-undefined row as unknown", () => {
    expect(licenceOfRow(undefined)).toBeNull();
    expect(
      licenceOfRow(official({ license: undefined, valid_until: undefined, is_valid: undefined })),
    ).toBeNull();
  });

  it("normalises partial and full crew licence fields", () => {
    expect(licenceOfRow(official({ license: null }))).toEqual({
      license: null,
      validUntil: null,
      isValid: false,
    });
    expect(
      licenceOfRow(official({ license: "F2", valid_until: "2026-01-01", is_valid: false })),
    ).toEqual({ license: "F2", validUntil: "2026-01-01", isValid: false });
    expect(licenceOfRow(official({ is_valid: true }))).toEqual({
      license: null,
      validUntil: null,
      isValid: true,
    });
  });

  it("copies a person's licence and returns null for nobody", () => {
    expect(licenceOfPerson(undefined)).toBeNull();
    expect(licenceOfPerson(person())).toEqual({
      license: "F1",
      validUntil: "2027-01-02",
      isValid: true,
    });
  });

  it("formats ISO dates and passes anything else through", () => {
    expect(formatLicenceDate("2026-03-04")).toBe("04.03.2026");
    expect(formatLicenceDate("not-a-date")).toBe("not-a-date");
    expect(formatLicenceDate("2026/03/04")).toBe("2026/03/04");
  });
});

describe("crew naming (Phase 3 characterization)", () => {
  it("uses an en dash for a missing team name", () => {
    expect(teamLabel(null)).toBe("–");
    expect(teamLabel("  ")).toBe("–");
    expect(teamLabel(" Lions ")).toBe(" Lions ");
  });

  it("joins a person's two names", () => {
    expect(personName(person())).toBe("Ada Lovelace");
    expect(personName(person({ last_name: "" }))).toBe("Ada");
  });

  it("resolves linked people, free text and unknown rows", () => {
    const team = new Map<number, TeamOfficial>([[7, person()]]);
    expect(rowDisplayName({ official: 7, name: "stale" }, team)).toBe("Ada Lovelace");
    expect(rowDisplayName({ official: 9, name: "  Guest  " }, team)).toBe("Guest");
    expect(rowDisplayName({ official: 9, name: "   " }, team)).toBeNull();
    expect(rowDisplayName({ official: 9, name: null }, team)).toBeNull();
    expect(rowDisplayName({ official: null, name: "Free Text" }, team)).toBe("Free Text");
    expect(rowDisplayName({ official: null, name: null }, team)).toBeNull();
  });
});

describe("slotsFromCrew (Phase 3 characterization)", () => {
  it("handles no positions and no rows", () => {
    expect(slotsFromCrew([], [])).toEqual([]);
    expect(slotsFromCrew([], [position()])).toEqual([
      {
        position: "Referee",
        label: "Schiedsrichter",
        required: true,
        rows: [],
        official: null,
        name: null,
        known: true,
        duplicate: false,
        licence: null,
      },
    ]);
  });

  it("keeps a stored row, marks duplicates and reads its licence", () => {
    const slots = slotsFromCrew(
      [
        official({ id: 1, official: 7, name: "Ada", license: "F1", is_valid: true }),
        official({ id: 2, official: 8, name: "Second" }),
      ],
      [position()],
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].duplicate).toBe(true);
    expect(slots[0].licence).toEqual({ license: "F1", validUntil: null, isValid: true });
  });

  it("appends unknown positions read-only and names blank ones", () => {
    const slots = slotsFromCrew(
      [
        official({ position: "   ", official: 3, name: null }),
        official({ position: "Ghost", official: null, name: "Guest" }),
        official({ position: "Ghost", official: 4, name: null }),
      ],
      [position()],
    );
    expect(slots.map((slot) => slot.label)).toEqual([
      "Schiedsrichter",
      "Ohne Position",
      "Ghost",
    ]);
    expect(slots[1].known).toBe(false);
    expect(slots[1].required).toBe(false);
    expect(slots[2].duplicate).toBe(true);
    expect(slots[2].licence).toBeNull();
  });
});

describe("setup and slot helpers (Phase 3 characterization)", () => {
  it("treats a single filled field as a saved setup", () => {
    expect(hasSavedSetup({})).toBe(false);
    expect(hasSavedSetup({ ctResult: "   " })).toBe(false);
    expect(hasSavedSetup({ ctResult: 7 as unknown as string })).toBe(false);
    expect(hasSavedSetup({ direction: "Ost" })).toBe(true);
    expect(hasSavedSetup({ fhPossession: "home" })).toBe(true);
    expect(hasSavedSetup({ ctResult: "away", direction: "West" })).toBe(true);
  });

  it("counts official, free text and stored rows as a filled slot", () => {
    const base = {
      position: "p",
      label: "p",
      required: true,
      rows: [],
      official: null,
      name: null,
      known: true,
      duplicate: false,
      licence: null,
    };
    expect(slotHasValue(base)).toBe(false);
    expect(slotHasValue({ ...base, official: 3 })).toBe(true);
    expect(slotHasValue({ ...base, name: "  " })).toBe(false);
    expect(slotHasValue({ ...base, name: "Guest" })).toBe(true);
    expect(slotHasValue({ ...base, rows: [official()] })).toBe(true);
  });
});

describe("side normalisation (Phase 3 characterization)", () => {
  it("reads literals, team names and fallbacks", () => {
    expect(normaliseSide(undefined, "Lions", "Centurions")).toBe("home");
    expect(normaliseSide(" AWAY ", "Lions", "Centurions")).toBe("away");
    expect(normaliseSide("home", "Lions", "Centurions")).toBe("home");
    expect(normaliseSide(" LIONS ", "Lions", "Centurions")).toBe("home");
    expect(normaliseSide(" centurions ", "Lions", "Centurions")).toBe("away");
    expect(normaliseSide("unknown", "Lions", "Centurions")).toBe("home");
    expect(normaliseSide("Lions", null, null)).toBe("home");
    expect(normaliseSide("Centurions", "Lions", null)).toBe("home");
    expect(normaliseSide("Centurions", null, "Centurions")).toBe("away");
  });

  it("reads German and English toss words before the side fallback", () => {
    expect(normaliseToss("gewonnen", "Lions", "Centurions")).toBe("away");
    expect(normaliseToss("WON", "Lions", "Centurions")).toBe("away");
    expect(normaliseToss("verloren", "Lions", "Centurions")).toBe("home");
    expect(normaliseToss("LOST", "Lions", "Centurions")).toBe("home");
    expect(normaliseToss(undefined, "Lions", "Centurions")).toBe("home");
    expect(normaliseToss("Centurions", "Lions", "Centurions")).toBe("away");
  });
});

describe("start error descriptions (Phase 3 characterization)", () => {
  it("recognises a device id in every body shape", () => {
    expect(carriesDeviceId("nope")).toBe(false);
    expect(carriesDeviceId(null)).toBe(false);
    expect(carriesDeviceId({ device_id: " abc " })).toBe(true);
    expect(carriesDeviceId({ device_id: "  " })).toBe(false);
    expect(carriesDeviceId({ device_id: 12 })).toBe(true);
    expect(carriesDeviceId({ device_id: null })).toBe(false);
    expect(carriesDeviceId({})).toBe(false);
  });

  it("describes lock, rejected state and generic failures", () => {
    expect(describeStartError(new Error("boom"))).toEqual({
      message: "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
      readOnly: false,
    });
    expect(describeStartError(new ApiError(500, {}, "  "))).toEqual({
      message: "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
      readOnly: false,
    });
    expect(describeStartError(new ApiError(409, { device_id: "x" }))).toEqual({
      message: "Dieses Spiel läuft auf einem anderen Gerät.",
      readOnly: true,
    });
    expect(describeStartError(new ApiError(409, {}, " auf einem anderen Gerät "))).toEqual({
      message: "auf einem anderen Gerät",
      readOnly: true,
    });
    expect(describeStartError(new ApiError(409, {}, "status"))).toEqual({
      message: "status",
      readOnly: false,
    });
    expect(describeStartError(new ApiError(409, {}))).toEqual({
      message: "Dieser Spielstatus erlaubt keinen Spielstart.",
      readOnly: false,
    });
    expect(describeStartError(new ApiError(503, {}, "offline"))).toEqual({
      message: "offline",
      readOnly: false,
    });
    expect(describeStartError({ status: 409 })).toEqual({
      message: "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
      readOnly: false,
    });
  });
});

describe("Segmented (Phase 3 characterization)", () => {
  it("renders selection, tone, hint and click handlers unchanged", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Münzwurf"
        value="home"
        options={[
          { value: "home", label: "Lions", tone: "home" },
          { value: "away", label: "Centurions" },
        ]}
        disabled={false}
        onChange={onChange}
        hint={<span>Wer wirft?</span>}
      />,
    );
    const group = screen.getByRole("group", { name: "Münzwurf" });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].getAttribute("class")).toBe("sel seg-home");
    expect(buttons[1].getAttribute("class")).toBeNull();
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    expect(group).toBeTruthy();
    expect(screen.getByText("Wer wirft?")).toBeTruthy();
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith("away");
  });

  it("supports an unset value, a tone-only option and no hint", () => {
    render(
      <Segmented
        label="Richtung"
        value={null}
        options={[
          { value: "north", label: "Nord", tone: "away" },
          { value: "south", label: "Süd" },
        ]}
        disabled
        onChange={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].getAttribute("class")).toBe("seg-away");
    expect(buttons[1].getAttribute("class")).toBeNull();
    expect(buttons[0].hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Wer wirft?")).toBeNull();
  });
});
