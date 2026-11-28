import type { Game, GameLogEventInput, GameSetup, RosterPlayer } from "../../api/types";
import { IgnoredWrite } from "../../components/sheets/errors";
import type { MoreMode } from "../../components/sheets/MoreSheet";
import type { SeriesMode } from "../../components/sheets/SeriesSheet";
import type { PlayResult, PlayType } from "../../components/sheets/PlaySheet";

export type Side = RosterPlayer["side"];

/** The open sheet: the touchdown entry, a series/time entry, or a more event. */
export type SheetState =
  | { kind: "touchdown" }
  | { kind: "play"; type?: PlayType; result?: PlayResult }
  | { kind: "challenge" }
  | { kind: "fieldpos" }
  | { kind: "series"; mode: SeriesMode }
  | { kind: "penalty" }
  | { kind: "more"; mode: MoreMode }
  | { kind: "quarterback" }
  | { kind: "spielzug" };

/** The log's event name for each one-tap entry, to find the row it wrote. */
export const ONE_TAP_EVENT: Partial<Record<SeriesMode, string>> = {
  first: "First Down",
  turnover: "Turnover",
  interception: "Interception",
};

/**
 * One-tap entries whose jersey is optional: they save on the first tap and
 * their tile offers "Nr. ergänzen" for the second. A Turnover names nobody.
 */
export type JerseyLater = "first" | "interception";

export function addsJerseyLater(mode: SeriesMode): mode is JerseyLater {
  return mode === "first" || mode === "interception";
}

/**
 * Header title: the field and the round, the two facts an official needs to be
 * sure they opened the right game. `standing` stands in when a game carries no
 * stage (designer-built rows often only have the bracket label).
 */
export function trackingTitle(game: Game): string {
  const stage = game.stage.trim() || game.standing.trim();
  return stage === "" ? `Feld ${game.field}` : `Feld ${game.field} · ${stage}`;
}

/** Header context: gameday and league, each part optional. */
export function trackingSubtitle(
  gamedayName?: string,
  leagueLabel?: string,
): string | undefined {
  const parts = [gamedayName?.trim(), leagueLabel?.trim()].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return parts.length === 0 ? undefined : parts.join(" · ");
}

const CONFIRMATION: Record<string, string> = {
  Touchdown: "Touchdown gespeichert",
  "1-Extra-Punkt": "Extrapunkt gespeichert",
  "2-Extra-Punkte": "2 Extrapunkte gespeichert",
  "First Down": "1st Down gespeichert",
  Turnover: "Turnover gespeichert",
  Interception: "Interception gespeichert",
  Spielzeit: "Spielzeit gespeichert",
  Auszeit: "Auszeit gespeichert",
  Strafe: "Strafe gespeichert",
  "Safety (+1)": "Safety gespeichert",
  "Safety (+2)": "Safety gespeichert",
  Overtime: "Overtime gespeichert",
  Pass: "Pass gespeichert",
  "Pass unvollständig": "Pass gespeichert",
  Run: "Run gespeichert",
  Sack: "Sack gespeichert",
  Challenge: "Challenge gespeichert",
  Feldposition: "Feldposition gespeichert",
  "Overtime starten": "Overtime gestartet",
};

/**
 * Events after which the ball stays where it is.
 *
 * Everything else hands the ball to the other team — a turnover, an
 * interception, a safety and an overtime score all kick off again. v1 also
 * flipped on an `Auszeit`, which was a bug: a timeout is called by the team in
 * possession and does not change it. A touchdown is *not* a ball change any
 * more: the try belongs to the scoring team, so only the try's result flips.
 * A mixed write group (a play and its Turnover row) flips as soon as one of
 * its rows does.
 */
const KEEP_POSSESSION = new Set([
  "Strafe",
  "Spielzeit",
  "Auszeit",
  "First Down",
  // A scrimmage play is the snap itself: the ball stays where it is.
  "Pass",
  "Pass unvollständig",
  "Run",
  "Sack",
  "Challenge",
  "Feldposition",
  "Overtime starten",
  // A touchdown keeps the ball: the try belongs to the scoring team, and the
  // flip is written when the try ends (+1/+2, a miss, a defensive score).
  "Touchdown",
]);

/** Whether a successful write hands the ball to the other team. */
export function flipsPossession(events: GameLogEventInput[]): boolean {
  // True as soon as **one** entry hands the ball over: a failed fourth down
  // writes the play and its Turnover row in one submission, and that mixed
  // submission must flip even though the play alone would keep the ball.
  // A legacy touchdown+conversion submission flips on its conversion.
  return events.some((event) => !KEEP_POSSESSION.has(event.name));
}

/**
 * Read a stored first possession back into a side. v2 writes `home`/`away`,
 * the old app wrote the team name, and `{}` means "no setup".
 */
export function setupSide(
  value: string | undefined,
  home: string | null,
  away: string | null,
): Side | null {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "") {
    return null;
  }
  if (token === "home") {
    return "home";
  }
  if (token === "away") {
    return "away";
  }
  if (home !== null && token === home.trim().toLowerCase()) {
    return "home";
  }
  if (away !== null && token === away.trim().toLowerCase()) {
    return "away";
  }
  return null;
}

/**
 * The team that starts the second half: the side that did **not** receive the
 * opening kickoff, exactly like v1 (`Details.handleHalftime` flips
 * `gameSetup.fhPossession`, not the current possession).
 *
 * Returns `null` when the setup carries no usable first possession — the caller
 * then falls back to handing the ball to the other team.
 */
export function secondHalfPossession(
  setup: GameSetup | null | undefined,
  home: string | null,
  away: string | null,
): string | null {
  const first = setupSide(setup?.fhPossession, home, away);
  if (first === null) {
    return null;
  }
  return first === "home" ? away : home;
}

/**
 * The team a submission is recorded for.
 *
 * Everything is credited to the possessing team, except an interception: the
 * defense statistics read the row's team as the team that made the play, and
 * v1 records it for the opponent. Sending the passer would credit every
 * interception to the wrong side.
 *
 * Throws when the write must not happen at all, so the calling sheet keeps its
 * state and shows why.
 */
export function writeTeam(
  events: GameLogEventInput[],
  possession: string | null,
  opponent: string | null,
): string {
  const intercepts = events.some((event) => event.name === "Interception");
  const team = intercepts ? opponent : possession;
  if (possession === null || team === null) {
    throw new IgnoredWrite("Kein Ballbesitz – bitte Team wählen.");
  }
  return team;
}

/** Short confirmation after a write, with the jersey or time it recorded. */
export function describeSaved(events: GameLogEventInput[]): string {
  const [first] = events;
  if (first === undefined) {
    return "Eintrag gespeichert";
  }
  const label = CONFIRMATION[first.name] ?? `${first.name} gespeichert`;
  if (first.input !== undefined) {
    return `${label} · ${first.input}`;
  }
  return first.player === undefined ? label : `${label} · #${first.player}`;
}
