import { useEffect, useId, useMemo, useRef, useState } from "react";

import { searchOfficials } from "../api/people";
import type { TeamOfficial } from "../api/types";

/** The stored crew slot: a linked directory person or a free-text name. */
export interface PersonValue {
  official: number | null;
  name: string | null;
}

interface PersonPickerProps {
  /** Role label ("Schiedsrichter"); every accessible name starts with it. */
  label: string;
  value: PersonValue;
  /** Officials team pk — its people sort to the top, nothing is filtered out. */
  teamId: number | null;
  /** Linked elsewhere already: shown, but never offered. */
  taken?: Set<number>;
  disabled?: boolean;
  /** Injected in tests; the default asks the API. */
  search?: (query: string) => Promise<TeamOfficial[]>;
  onPick: (person: TeamOfficial) => void;
  onFreeText: (name: string) => void;
  /** Clears the slot back to "nobody". Omitted → no clear action is shown. */
  onClear?: () => void;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * The last finished request. "Searching" is derived from it (any query without
 * a matching result is still in flight), so the effect never sets state
 * synchronously — that would cascade a render for every keystroke.
 */
type SearchResult =
  | { kind: "done"; term: string; people: TeamOfficial[] }
  | { kind: "offline"; term: string };

const FREE_TEXT_HINT = "Vor- und Nachname angeben";
const MATCH_HINT = "Bitte eine gefundene Person wählen";

/** Exactly one first and one last name: what a free-text crew entry needs. */
export function isFullName(query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  return tokens.length >= 2;
}

export function personName(person: TeamOfficial): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

/**
 * Crew slot picker: a searchable replacement for the old team-only select.
 *
 * The operator types, the picker suggests people from the whole directory and
 * marks each option with its team. A person already linked to another slot is
 * shown but cannot be picked — the backend upserts by position and a double
 * booking is a data problem, not a preference.
 *
 * Free text stays possible, because a guest official may not be in the
 * directory at all. It needs a first and a last name (the point of the exercise
 * is a record somebody can be matched against later) and it is refused while a
 * person matches: offering the unlinked variant next to a found person is how
 * the old app produced records nobody could resolve.
 */
export default function PersonPicker({
  label,
  value,
  teamId,
  taken,
  disabled = false,
  search,
  onPick,
  onFreeText,
  onClear,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionId = useId();

  const runSearch = useMemo(
    () => search ?? ((term: string) => searchOfficials(term, teamId)),
    [search, teamId],
  );
  const blocked = taken ?? new Set<number>();

  const term = query.trim();
  const tooShort = term.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!open || tooShort) {
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      runSearch(term)
        .then((people) => {
          if (!alive) {
            return;
          }
          setResult({ kind: "done", term, people });
          setActive(0);
        })
        .catch(() => {
          if (alive) {
            setResult({ kind: "offline", term });
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, tooShort, term, runSearch]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // A result only describes the query it was fetched for; anything else is
  // still "searching", without an extra state write.
  const settled = result !== null && result.term === term ? result : null;
  const people = settled?.kind === "done" ? settled.people : [];
  const hasResults = people.length > 0;
  const canFreeText = isFullName(query);
  const displayName = value.name?.trim() || "Offiziellen wählen";

  const close = (): void => {
    setOpen(false);
    setQuery("");
    setResult(null);
  };

  const pick = (person: TeamOfficial): void => {
    if (blocked.has(person.id)) {
      return;
    }
    onPick(person);
    close();
  };

  const move = (step: number): void => {
    if (people.length === 0) {
      return;
    }
    let next = active;
    for (let hops = 0; hops < people.length; hops += 1) {
      next = (next + step + people.length) % people.length;
      if (!blocked.has(people[next].id)) {
        setActive(next);
        return;
      }
    }
  };

  const applyFreeText = (): void => {
    if (!canFreeText) {
      return;
    }
    onFreeText(query.trim());
    close();
  };

  let note: string | null = null;
  if (tooShort) {
    note = `Mindestens ${MIN_QUERY_LENGTH} Zeichen`;
  } else if (settled === null) {
    note = "Suche …";
  } else if (settled.kind === "offline") {
    note = "Suche nur online";
  } else if (settled.people.length === 0) {
    note = "Niemanden gefunden";
  }

  return (
    <div className="pp">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label}: Offiziellen wählen`}
        className="offsel ppbtn"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        type="button"
      >
        <span className="ppname">{displayName}</span>
        <span
          className={`pplink ${value.official === null ? "pplink-free" : "pplink-on"}`}
        >
          {value.official === null ? "Freitext" : "verknüpft"}
        </span>
      </button>

      {open ? (
        <div className="pppanel">
          <input
            aria-activedescendant={
              hasResults ? `${optionId}-${active}` : undefined
            }
            aria-autocomplete="list"
            aria-controls={`${optionId}-list`}
            aria-label={`${label}: Person suchen`}
            autoComplete="off"
            className="sheetinput ppinput"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter") {
                const person = people[active];
                if (person !== undefined) {
                  event.preventDefault();
                  pick(person);
                }
              } else if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
            placeholder="Nachname eingeben"
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            type="search"
            value={query}
          />

          {note === null ? null : (
            <p className="ppnote" role="status">
              {note}
            </p>
          )}

          <ul
            aria-label={`${label}: Vorschläge`}
            className="pplist"
            id={`${optionId}-list`}
            role="listbox"
          >
            {people.map((person, index) => {
              const busy = blocked.has(person.id);
              return (
                <li
                  aria-disabled={busy || undefined}
                  aria-selected={index === active}
                  className={[
                    "ppoption",
                    busy ? "ppoption-busy" : null,
                    index === active && !busy ? "sel" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  id={`${optionId}-${index}`}
                  key={person.id}
                  onClick={() => pick(person)}
                  role="option"
                >
                  <span className="ppperson">{personName(person)}</span>
                  <span className="ppteam">{person.team}</span>
                  {busy ? (
                    <span className="ppbusy">bereits gesetzt</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {onClear !== undefined &&
          (value.official !== null || (value.name ?? "").trim() !== "") ? (
            <button
              className="ppclear"
              onClick={() => {
                onClear();
                close();
              }}
              type="button"
            >
              Auswahl entfernen
            </button>
          ) : null}

          {hasResults ? (
            <p className="ppnote">{MATCH_HINT}</p>
          ) : (
            <>
              <button
                className="ppfree"
                disabled={!canFreeText}
                onClick={applyFreeText}
                type="button"
              >
                Als Freitext übernehmen
              </button>
              {canFreeText ? null : (
                <p className="ppnote">{FREE_TEXT_HINT}</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
