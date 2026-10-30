import { useId } from "react";

import type { RosterPlayer } from "../api/types";

/** One grid button: a jersey and the surname shown under it. */
export interface JerseyOption {
  jersey: number;
  name: string | null;
}

/**
 * One option per jersey number.
 *
 * `GET /api/game/<id>/roster` deliberately returns duplicate numbers as they
 * are (the passcheck flags that data problem instead of hiding it), but the
 * write payload only carries the number — two buttons with the same number
 * would be indistinguishable, so the first one wins here.
 */
export function jerseyOptions(players: RosterPlayer[]): JerseyOption[] {
  const seen = new Set<number>();
  const options: JerseyOption[] = [];
  for (const player of players) {
    if (seen.has(player.jersey)) {
      continue;
    }
    seen.add(player.jersey);
    options.push({ jersey: player.jersey, name: player.name });
  }
  return options.sort((left, right) => left.jersey - right.jersey);
}

/** Digits only, at most two of them: the field accepts 0–99. */
export function jerseyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

/**
 * Above this many players the tile grid stops fitting a phone screen (a
 * tackle roster runs to 45+), and typing the two digits the referee saw is
 * faster than scrolling for the tile.
 */
export const KEYPAD_ABOVE = 24;

/** Whether `jersey` may be saved: a checked roster only takes its own numbers. */
export function jerseyAllowed(
  players: RosterPlayer[],
  jersey: number | null,
  strict: boolean,
): boolean {
  if (jersey === null) {
    return false;
  }
  return !strict || players.length === 0 || players.some((player) => player.jersey === jersey);
}

interface JerseyPickerProps {
  /** Roster of one side, already filtered by the caller. */
  players: RosterPlayer[];
  value: number | null;
  onChange: (jersey: number | null) => void;
  disabled?: boolean;
  /** Group label for the grid and name of the fallback input. */
  label?: string;
  /**
   * The roster is a passed passcheck: the keypad refuses a number outside it
   * (the grid only offers roster numbers anyway).
   */
  strict?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "Löschen"];

/** Two-digit entry for a large roster; the roster name confirms the number. */
function JerseyKeypad({
  options,
  value,
  onChange,
  disabled,
  label,
  strict,
}: {
  options: JerseyOption[];
  value: number | null;
  onChange: (jersey: number | null) => void;
  disabled: boolean;
  label: string;
  strict: boolean;
}) {
  const digits = value === null ? "" : String(value);
  const match = options.find((option) => option.jersey === value) ?? null;
  const press = (key: string): void => {
    const next = key === "Löschen" ? digits.slice(0, -1) : jerseyDigits(digits + key);
    onChange(next === "" ? null : Number(next));
  };
  let note: string | null = null;
  let tone = "";
  if (value !== null && match === null) {
    note = strict ? "nicht im bestätigten Kader" : "nicht im Kader";
    tone = strict ? " bad" : " warn";
  }

  return (
    <div className="keypadwrap">
      <p aria-label={label} className={`keypaddisp${tone}`} role="status">
        <span className="keypadnum">{digits === "" ? "–" : digits}</span>
        {match?.name?.trim() ? (
          <span className="keypadname">{match.name.trim()}</span>
        ) : null}
        {note === null ? null : <span className="keypadnote">{note}</span>}
      </p>
      <div aria-label="Ziffern" className="keypad" role="group">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span aria-hidden="true" key={`gap${index}`} />
          ) : (
            <button
              aria-label={key}
              className="keypadkey"
              disabled={disabled || (key === "Löschen" ? digits === "" : digits.length >= 2)}
              key={key}
              onClick={() => press(key)}
              type="button"
            >
              {key === "Löschen" ? "⌫" : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Jersey choice for the touchdown sheet: a grid of the possession team's
 * roster (a keypad above {@link KEYPAD_ABOVE} players), or a plain number
 * field when there is no roster to show.
 *
 * The roster endpoint is the only source for the grid — the app never invents
 * numbers. A game whose passcheck never ran (or whose roster request failed)
 * still gets a numeric field, otherwise the touchdown could not be recorded at
 * all and the game would need a paper sheet.
 */
export default function JerseyPicker({
  players,
  value,
  onChange,
  disabled = false,
  label = "Trikotnummer",
  strict = false,
}: JerseyPickerProps) {
  const inputId = useId();
  const options = jerseyOptions(players);

  if (options.length > KEYPAD_ABOVE) {
    return (
      <JerseyKeypad
        disabled={disabled}
        label={label}
        onChange={onChange}
        options={options}
        strict={strict}
        value={value}
      />
    );
  }

  if (options.length === 0) {
    return (
      <div className="sheetfield">
        <label className="sheetlabel" htmlFor={inputId}>
          {label} (0–99)
        </label>
        <input
          autoComplete="off"
          className="sheetinput sheetinput-num"
          disabled={disabled}
          id={inputId}
          inputMode="numeric"
          onChange={(event) => {
            const digits = jerseyDigits(event.target.value);
            onChange(digits === "" ? null : Number(digits));
          }}
          pattern="[0-9]*"
          placeholder="z. B. 23"
          type="text"
          value={value === null ? "" : String(value)}
        />
        <p className="sheetnote">
          Kein Kader geladen – Nummer manuell eingeben.
        </p>
      </div>
    );
  }

  return (
    <div aria-label={label} className="jerseygrid" role="group">
      {options.map((option) => {
        const selected = option.jersey === value;
        const name = option.name?.trim() || null;
        return (
          <button
            aria-label={
              name === null
                ? `${label} ${option.jersey}`
                : `${label} ${option.jersey}, ${name}`
            }
            aria-pressed={selected}
            className={selected ? "jersey sel" : "jersey"}
            disabled={disabled}
            key={option.jersey}
            onClick={() => onChange(option.jersey)}
            type="button"
          >
            <span className="jerseynum">{option.jersey}</span>
            {name === null ? null : <span className="jerseyname">{name}</span>}
          </button>
        );
      })}
    </div>
  );
}
