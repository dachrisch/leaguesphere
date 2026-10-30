import type { Game } from "../api/types";
import { gameTag } from "../components/tag";

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** Render the API's `HH:MM[:SS]` value as `HH:MM`, or `–` when unusable. */
export function formatGameTime(scheduled: string | null | undefined): string {
  const match = CLOCK.exec(scheduled ?? "");
  if (match === null) {
    return "–";
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return "–";
  }
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

export interface DaySummary {
  running: number;
  open: number;
  finished: number;
}

/** Counts use the same status mapping as the rows, including legacy values. */
export function daySummary(games: Game[]): DaySummary {
  const summary: DaySummary = { running: 0, open: 0, finished: 0 };
  for (const game of games) {
    const action = gameTag(game.status).action;
    if (action === "resume") {
      summary.running += 1;
    } else if (action === "none") {
      summary.finished += 1;
    } else {
      summary.open += 1;
    }
  }
  return summary;
}

export interface TimetableRow {
  time: string;
  cells: (Game | null)[];
}

export interface GameTimetable {
  fields: number[];
  rows: TimetableRow[];
}

/** One column per field and one row per distinct, chronologically sorted time. */
export function groupGamesByFieldAndTime(games: Game[]): GameTimetable {
  const fields = [...new Set(games.map((game) => game.field))].sort(
    (left, right) => left - right,
  );
  const times = [...new Set(games.map((game) => formatGameTime(game.scheduled)))].sort(
    (left, right) => {
      if (left === "–") {
        return 1;
      }
      if (right === "–") {
        return -1;
      }
      return left.localeCompare(right);
    },
  );

  return {
    fields,
    rows: times.map((time) => ({
      time,
      cells: fields.map(
        (field) =>
          games.find(
            (game) =>
              game.field === field && formatGameTime(game.scheduled) === time,
          ) ?? null,
      ),
    })),
  };
}
