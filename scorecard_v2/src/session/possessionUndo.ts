/**
 * Which team gets the ball back when an entry is undone?
 *
 * The entry tables record the ball's *new* side with a separate possession op
 * (`setPossession`), because the server does not move it for us. Undoing the
 * entry must reverse that move, or the turnover disappears while the ball
 * stays with the other team. Only the entries that hand the ball over have an
 * answer here; everything else returns `null` and the screen leaves the marker
 * alone.
 */
import type { GameLog } from "../api/types";
import type { LogRow } from "../components/EventLog";
import { sideOfName } from "./events";

/** Rows whose `team` was the offence *before* the ball moved. */
const OLD_POSSESSION = new Set(["Turnover", "Touchdown", "Overtime"]);

/** Rows whose `team` is the *new* offence after the ball moved. */
const NEW_POSSESSION = new Set([
  "Interception",
  "Safety (+1)",
  "Safety (+2)",
  "Safety",
]);

/**
 * The team that held the ball before `row`, or `null` when undoing the row
 * must not move it (an entry that keeps possession, a deleted row, a team name
 * that is not part of this game).
 */
export function undoPossessionTeam(row: LogRow, log: GameLog): string | null {
  if (row.isDeleted || row.team === null) {
    return null;
  }
  const side = sideOfName(row.team, log);
  if (side === null) {
    return null;
  }
  if (OLD_POSSESSION.has(row.event)) {
    return row.team;
  }
  if (NEW_POSSESSION.has(row.event)) {
    // An interception/safety row is credited to the team that just took the
    // ball, so the pre-entry offence is the other side.
    return side === "home" ? log.away.name : log.home.name;
  }
  return null;
}
