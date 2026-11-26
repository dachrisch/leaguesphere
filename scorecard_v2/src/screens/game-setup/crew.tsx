import type { ReactNode } from "react";

import { ApiError } from "../../api/client";
import type {
  CrewPosition,
  GameSetup as GameSetupPayload,
  Official,
  TeamOfficial,
} from "../../api/types";

export type Side = "home" | "away";

export interface CrewSlot {
  /** Exact stored position; sent back verbatim when the slot is saved. */
  position: string;
  /** The league's display name for the position, or the raw position. */
  label: string;
  /** Whether an empty slot counts against the completeness counter. */
  required: boolean;
  /** All stored rows for this position; more than one is a data problem. */
  rows: Official[];
  /** First row, editable in place. Unknown and duplicate slots stay read-only. */
  official: number | null;
  name: string | null;
  known: boolean;
  duplicate: boolean;
  /**
   * Licence facts from the crew read, or from the person the picker took.
   * `null` means the screen has no data and must say "unbekannt" instead of
   * claiming a licence problem.
   */
  licence: CrewLicence | null;
}

/** The licence facts a crew row, a search result or a picked person carries. */
export interface CrewLicence {
  license: string | null;
  validUntil: string | null;
  isValid: boolean;
}

export function licenceOfRow(row: Official | undefined): CrewLicence | null {
  if (row === undefined) {
    return null;
  }
  if (
    row.license === undefined &&
    row.valid_until === undefined &&
    row.is_valid === undefined
  ) {
    return null;
  }
  return {
    license: row.license ?? null,
    validUntil: row.valid_until ?? null,
    isValid: row.is_valid === true,
  };
}

export function licenceOfPerson(
  person: TeamOfficial | undefined,
): CrewLicence | null {
  if (person === undefined) {
    return null;
  }
  return {
    license: person.license,
    validUntil: person.valid_until,
    isValid: person.is_valid,
  };
}

/** Body of `PUT /api/game/<pk>/officials` (`GameOfficialSerializer`). */
export interface CrewWrite {
  position: string;
  official: number | null;
  name: string | null;
}

export type LicenceState = "valid" | "expired" | "missing" | "unknown" | "empty";

export const LICENCE_TONE: Record<LicenceState, string> = {
  valid: "ok",
  expired: "warn",
  missing: "missing",
  unknown: "unknown",
  empty: "empty",
};

export interface Licence {
  state: LicenceState;
  label: string;
}

export const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-03-04` → `04.03.2026`; anything else is shown as-is. */
export function formatLicenceDate(value: string): string {
  const match = DATE.exec(value);
  if (match === null) {
    return value;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function teamLabel(name: string | null): string {
  return name !== null && name.trim() !== "" ? name : "–";
}

export function personName(person: TeamOfficial): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

export function rowDisplayName(
  row: Pick<Official, "official" | "name">,
  team: Map<number, TeamOfficial>,
): string | null {
  if (row.official !== null) {
    const person = team.get(row.official);
    if (person !== undefined) {
      return personName(person);
    }
  }
  return row.name?.trim() || null;
}

/**
 * One slot per configured position plus one read-only slot per unknown one.
 *
 * The slots come from the league's configuration merged onto the server's
 * defaults (`GET /api/officials/crew-positions/game/<id>`), already in display
 * order:
 * associations name and order their crew differently, and only the league
 * knows which slots make a crew complete. `position` stays the exact wire
 * value — the API upserts by that string, so a "clever" alias would leave the
 * stored row untouched and create a second one. Unknown positions are kept and
 * shown; duplicate positions are marked so the screen can refuse to write them
 * (the backend's `get_or_create` would raise `MultipleObjectsReturned`).
 */
export function slotsFromCrew(
  crew: Official[],
  positions: CrewPosition[],
): CrewSlot[] {
  const byPosition = new Map<string, Official[]>();
  for (const row of crew) {
    const rows = byPosition.get(row.position);
    if (rows === undefined) {
      byPosition.set(row.position, [row]);
    } else {
      rows.push(row);
    }
  }

  const slots: CrewSlot[] = positions.map((slot) => {
    const rows = byPosition.get(slot.position) ?? [];
    byPosition.delete(slot.position);
    return {
      position: slot.position,
      label: slot.label,
      required: slot.required,
      rows,
      official: rows[0]?.official ?? null,
      name: rows[0]?.name ?? null,
      known: true,
      duplicate: rows.length > 1,
      licence: licenceOfRow(rows[0]),
    };
  });

  for (const [position, rows] of byPosition) {
    slots.push({
      position,
      label: position.trim() === "" ? "Ohne Position" : position,
      // A position the league does not configure is a data problem, not a
      // slot: it is shown read-only and never counts as required.
      required: false,
      rows,
      official: rows[0]?.official ?? null,
      name: rows[0]?.name ?? null,
      known: false,
      duplicate: rows.length > 1,
      licence: licenceOfRow(rows[0]),
    });
  }

  return slots;
}

/** `{}` means "not prepared yet"; a single filled field makes it a resume. */
export function hasSavedSetup(setup: GameSetupPayload): boolean {
  return [setup.ctResult, setup.direction, setup.fhPossession].some(
    (value) => typeof value === "string" && value.trim() !== "",
  );
}

/** A slot counts as staffed when it links somebody or stores a free-text name. */
export function slotHasValue(slot: CrewSlot): boolean {
  return (
    slot.official !== null ||
    (slot.name ?? "").trim() !== "" ||
    slot.rows.length > 0
  );
}

/**
 * Read a saved side back into v2's `home`/`away`. Older games stored the team
 * *name*; anything unrecognised falls back to the home side.
 */
export function normaliseSide(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "away") {
    return "away";
  }
  if (token === "home") {
    return "home";
  }
  if (home !== null && token === home.trim().toLowerCase()) {
    return "home";
  }
  if (away !== null && token === away.trim().toLowerCase()) {
    return "away";
  }
  return "home";
}

/**
 * The old app's coin toss was recorded relative to the *away* side ("Münzwahl
 * hat: away" plus Gewonnen/Verloren), so `gewonnen` means the away team won.
 */
export function normaliseToss(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "gewonnen" || token === "won") {
    return "away";
  }
  if (token === "verloren" || token === "lost") {
    return "home";
  }
  return normaliseSide(value, home, away);
}

/** The server sends `device_id` alongside the detail when it holds the lock. */
export function carriesDeviceId(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const value = (body as { device_id?: unknown }).device_id;
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

export function describeStartError(error: unknown): {
  message: string;
  readOnly: boolean;
} {
  const detail =
    error instanceof ApiError && typeof error.detail === "string"
      ? error.detail.trim()
      : "";
  if (error instanceof ApiError && error.status === 409) {
    const deviceLock =
      carriesDeviceId(error.body) || detail.includes("anderen Gerät");
    if (deviceLock) {
      return {
        message: detail || "Dieses Spiel läuft auf einem anderen Gerät.",
        readOnly: true,
      };
    }
    return {
      message: detail || "Dieser Spielstatus erlaubt keinen Spielstart.",
      readOnly: false,
    };
  }
  return {
    message: detail || "Der Start ist fehlgeschlagen. Bitte erneut versuchen.",
    readOnly: false,
  };
}

export interface SegmentedProps {
  label: string;
  /** `null` while nothing was chosen: an unset field is refused, not defaulted. */
  value: string | null;
  options: { value: string; label: ReactNode; tone?: Side }[];
  disabled: boolean;
  onChange: (value: string) => void;
  /** One line under the switch, e.g. who calls the coin toss. */
  hint?: ReactNode;
}

/** Two-option switch in the mock's `.seg` language. */
export function Segmented({
  label,
  value,
  options,
  disabled,
  onChange,
  hint,
}: SegmentedProps) {
  return (
    <section className="segfield">
      <h3 className="segtitle">{label}</h3>
      <div aria-label={label} className="seg" role="group">
        {options.map((option) => {
          const classes = [
            option.value === value ? "sel" : null,
            option.tone === undefined ? null : `seg-${option.tone}`,
          ].filter((name): name is string => name !== null);
          return (
            <button
              aria-pressed={option.value === value}
              className={classes.length === 0 ? undefined : classes.join(" ")}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint === undefined ? null : <p className="setupnote">{hint}</p>}
    </section>
  );
}

/** Which of the two scorecard teams a saved `home`/`away` side refers to. */
export function sideTeam(
  side: Side,
  home: string | null,
  away: string | null,
): string | null {
  return side === "home" ? home : away;
}
