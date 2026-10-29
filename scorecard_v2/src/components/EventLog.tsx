import type { ComponentType } from "react";

import type { GameLog, GameLogEvent, LogEntry } from "../api/types";
import {
  ArrowRight,
  Clock,
  Flag,
  Football,
  Interception,
  PlusCircle,
  Shield,
  Stopwatch,
  Undo,
  Whistle,
  type IconProps,
} from "./icons";

/**
 * The event names `GameLog._get_entries_for_team_and_half` filters out of the
 * scoring entries. They share sequence 0 with each other (and with the game
 * markers), so they can only be undone row by row.
 */
const EXCLUDED_EVENTS = new Set([
  "Strafe",
  "Spielzeit",
  "Auszeit",
  "First Down",
]);

const SCORING_KEYS: Record<string, string> = {
  td: "Touchdown",
  pat1: "1-Extra-Punkt",
  pat2: "2-Extra-Punkte",
  OT: "Overtime",
};

/**
 * Game-level markers. Deleting one only strikes the log row: it cannot revert
 * `Gameinfo.gameStarted` / `gameHalftime` / `gameFinished`, so undo would lie
 * about the game state. They stay visible and non-undoable.
 */
const MARKER_EVENTS = new Set([
  "Spiel gestartet",
  "2. Halbzeit gestartet",
  "Spiel beendet",
]);

const FALLBACK_IGNORED_KEYS = new Set([
  "sequence",
  "time",
  "isDeleted",
  "cop",
  "name",
  "player",
  "td",
  "pat1",
  "pat2",
  "OT",
]);

export type EventKind =
  | "td"
  | "pat"
  | "pen"
  | "int"
  | "first"
  | "safety"
  | "to"
  | "time"
  | "note";

/** One icon per kind; the visible row text still carries the meaning. */
const KIND_ICON: Record<EventKind, ComponentType<IconProps>> = {
  td: Football,
  pat: PlusCircle,
  pen: Flag,
  int: Interception,
  first: ArrowRight,
  safety: Shield,
  to: Clock,
  time: Stopwatch,
  note: Whistle,
};

/** One rendered log line — a raw event or a reconstructed scoring entry. */
export interface LogRow {
  /** Stable React key. */
  key: string;
  /** `TeamLog` pk; `null` only for rows reconstructed from scoring entries. */
  teamLogId: number | null;
  sequence: number;
  team: string | null;
  event: string;
  player: number | null;
  input: string | null;
  half: number;
  cop: boolean;
  isDeleted: boolean;
  /** ISO-8601 UTC, or `null` when the server omitted it. */
  time: string | null;
}

/**
 * Body of `DELETE /api/gamelog/<id>` for one row.
 *
 * Scoring plays are undone as a play (`sequence`, so a touchdown takes its
 * conversion with it). Excluded events and the game markers share sequence 0
 * across many rows, so they are undone by row id — deleting sequence 0 would
 * wipe every penalty and timeout of the game.
 */
export function undoBody(
  row: LogRow,
): { sequence: number } | { team_log_id: number } {
  if (
    row.teamLogId !== null &&
    (EXCLUDED_EVENTS.has(row.event) || row.sequence === 0)
  ) {
    return { team_log_id: row.teamLogId };
  }
  return { sequence: row.sequence };
}

/** Markers are shown but not undoable; see {@link MARKER_EVENTS}. */
export function isMarker(row: LogRow): boolean {
  return MARKER_EVENTS.has(row.event);
}

function jersey(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function jerseyText(value: number | null): string | null {
  return value === null ? null : `#${value}`;
}

function join(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter((part): part is string => Boolean(part)).join(" · ");
  return text === "" ? null : text;
}

function eventToRow(event: GameLogEvent): LogRow {
  return {
    key: `e${event.id}`,
    teamLogId: event.id,
    sequence: event.sequence,
    team: event.team,
    event: event.event,
    player: event.player,
    input: event.input?.trim() || null,
    half: event.half,
    cop: event.cop,
    isDeleted: event.isDeleted,
    time: event.time ?? null,
  };
}

/**
 * Rebuild rows from the scoring entries of a server that predates `events`.
 * The non-scoring events are absent by definition; the scoring plays keep
 * working, including their undo by sequence.
 */
function fallbackRows(log: GameLog): LogRow[] {
  const rows: LogRow[] = [];
  const sides = [
    ["home", log.home],
    ["away", log.away],
  ] as const;
  const halves = [
    ["firsthalf", 1],
    ["secondhalf", 2],
  ] as const;

  for (const [side, team] of sides) {
    for (const [halfKey, half] of halves) {
      team[halfKey].entries.forEach((entry: LogEntry, index) => {
        const base = {
          teamLogId: null,
          sequence: entry.sequence,
          team: team.name,
          half,
          cop: entry.cop === true,
          isDeleted: entry.isDeleted === true,
          time: typeof entry.time === "string" ? entry.time : null,
        };
        const key = (event: string) =>
          `s-${side}-${halfKey}-${entry.sequence}-${event}-${index}`;

        const scoring = Object.entries(SCORING_KEYS).filter(
          ([field]) => entry[field] !== undefined,
        );
        for (const [field, event] of scoring) {
          rows.push({
            ...base,
            key: key(event),
            event,
            player: jersey(entry[field]),
            input: null,
          });
        }
        if (entry.cop === true && typeof entry.name === "string") {
          rows.push({
            ...base,
            key: key(entry.name),
            event: entry.name,
            player: jersey(entry.player),
            input: null,
          });
        }
        for (const [field, value] of Object.entries(entry)) {
          if (FALLBACK_IGNORED_KEYS.has(field)) {
            continue;
          }
          rows.push({
            ...base,
            key: key(field),
            event: field,
            player: jersey(value),
            input: null,
          });
        }
      });
    }
  }

  // Newest first. The halves themselves are chronological, so a missing time
  // falls back to the later half, then the higher sequence.
  return rows.sort((left, right) => {
    if (left.time !== null && right.time !== null && left.time !== right.time) {
      return left.time < right.time ? 1 : -1;
    }
    if (left.time === null && right.time !== null) {
      return 1;
    }
    if (left.time !== null && right.time === null) {
      return -1;
    }
    if (left.half !== right.half) {
      return right.half - left.half;
    }
    return right.sequence - left.sequence;
  });
}

/** Log rows, newest first. The server's `events` win; entries are the fallback. */
export function logRows(log: GameLog): LogRow[] {
  if (Array.isArray(log.events)) {
    return log.events.map(eventToRow);
  }
  return fallbackRows(log);
}

interface Described {
  kind: EventKind;
  primary: string;
  secondary: string | null;
}

/** The row's one-line label plus its optional detail line. */
export function describeRow(row: LogRow): Described {
  const team = row.team ?? "–";
  switch (row.event) {
    case "Touchdown":
      return {
        kind: "td",
        primary: `Touchdown ${team}`,
        secondary: jerseyText(row.player),
      };
    case "1-Extra-Punkt":
      return {
        kind: "pat",
        primary: `1 Extrapunkt ${team}`,
        secondary: jerseyText(row.player),
      };
    case "2-Extra-Punkte":
      return {
        kind: "pat",
        primary: `2 Extrapunkte ${team}`,
        secondary: jerseyText(row.player),
      };
    case "Overtime":
      return {
        kind: "pat",
        primary: `Overtime ${team}`,
        secondary: jerseyText(row.player),
      };
    case "Turnover":
    case "Interception":
      return {
        kind: "int",
        primary: `${row.event} ${team}`,
        secondary: jerseyText(row.player),
      };
    case "First Down":
      return {
        kind: "first",
        primary: `1st Down ${team}`,
        secondary: jerseyText(row.player),
      };
    case "Safety (+1)":
    case "Safety (+2)":
    case "Safety": {
      const points = row.event.endsWith("(+1)")
        ? "+1 Punkt"
        : row.event.endsWith("(+2)")
          ? "+2 Punkte"
          : null;
      return {
        kind: "safety",
        primary: `Safety · ${team}`,
        secondary: join(points, jerseyText(row.player)),
      };
    }
    case "Strafe":
      return {
        kind: "pen",
        primary: `Strafe gegen ${team}`,
        secondary: join(row.input, jerseyText(row.player)),
      };
    case "Auszeit":
      return {
        kind: "to",
        primary: `Auszeit ${team}`,
        secondary: row.input,
      };
    case "Spielzeit":
      return {
        kind: "time",
        primary: `Spielzeit ${row.input ?? ""}`.trim(),
        secondary: null,
      };
    default:
      return {
        kind: "note",
        primary: row.event,
        secondary: row.input,
      };
  }
}

/** `HH:MM` in the viewer's local time; an unparsable value renders empty. */
export function formatLogTime(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface EventLogProps {
  rows: LogRow[];
  onUndo: (row: LogRow) => void;
  /** Key of the row whose undo is in flight; its button is disabled. */
  undoKey?: string | null;
  /**
   * True while another write owns the screen (half-time). Undo waits: a
   * `DELETE` answer that lands after the half switch still describes the first
   * half and would put the screen back there.
   */
  disabled?: boolean;
  /** Undo failure shown above the list. */
  error?: string | null;
}

/**
 * The live log: newest first, one row per event, undo per row.
 *
 * The list scrolls inside its own block so the score header stays put while
 * an official thumbs through a long second half.
 */
export default function EventLog({
  rows,
  onUndo,
  undoKey = null,
  disabled = false,
  error = null,
}: EventLogProps) {
  return (
    <section aria-label="Spielverlauf" className="logblock">
      <div className="loghead">
        <h2>Spielverlauf</h2>
        <span>{rows.length} Einträge</span>
      </div>
      {error === null ? null : (
        <p className="logerror" role="alert">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="logempty">Noch keine Einträge</p>
      ) : (
        <ol className="logrows">
          {rows.map((row) => {
            const described = describeRow(row);
            const KindIcon = KIND_ICON[described.kind];
            const undoable = !row.isDeleted && !isMarker(row);
            return (
              <li
                className={row.isDeleted ? "row deleted" : "row"}
                key={row.key}
              >
                <span
                  aria-hidden="true"
                  className={`ev ev-${described.kind}`}
                >
                  <KindIcon size={18} />
                </span>
                <span className="rowmain">
                  <span className="rowprimary">{described.primary}</span>
                  {described.secondary === null ? null : (
                    <span className="rowsub">{described.secondary}</span>
                  )}
                  {row.isDeleted ? (
                    <span className="sr-only">gelöscht</span>
                  ) : null}
                </span>
                <span className="rowright">
                  <time className="rowtime" dateTime={row.time ?? undefined}>
                    {formatLogTime(row.time)}
                  </time>
                  {undoable ? (
                    <button
                      aria-label={`Rückgängig: ${described.primary}`}
                      className="undo"
                      disabled={disabled || undoKey !== null}
                      onClick={() => onUndo(row)}
                      type="button"
                    >
                      <Undo size={14} />
                      Rückgängig
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
