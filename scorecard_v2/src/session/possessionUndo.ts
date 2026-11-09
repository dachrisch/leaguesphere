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

/** The try's rows: they end the try and hand the ball to the other team. */
const TRY_ROWS = new Set(["1-Extra-Punkt", "2-Extra-Punkte"]);

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
    // A pick-six touchdown is credited to the defence; the ball was with the
    // offence before the interception.
    if (row.event === "Touchdown" && row.payload?.defense === true) {
      return side === "home" ? log.away.name : log.home.name;
    }
    return row.team;
  }
  if (TRY_ROWS.has(row.event)) {
    // A normal try is credited to the scoring team, which held the ball before
    // it; a defensive try (`try_defense`) is credited to the defence, so the
    // ball was with the other side.
    if (row.payload?.try_defense === true) {
      return side === "home" ? log.away.name : log.home.name;
    }
    return row.team;
  }
  if (NEW_POSSESSION.has(row.event)) {
    // An interception/safety row is credited to the team that just took the
    // ball, so the pre-entry offence is the other side.
    return side === "home" ? log.away.name : log.home.name;
  }
  return null;
}

/**
 * The same answer for a **group** of rows written by one submission.
 *
 * A scoring play is two rows since the touchdown became the play's result
 * (meeting 2026-11-05, 53:05): the play and its touchdown share one
 * `groupSequence` and undoing either removes both. Only the touchdown row
 * carries the flip, so asking the row alone would leave the ball with the other
 * team when the operator undoes the play row - the one the log shows with the
 * yards.
 *
 * The two rows have **different** `eventSeq` values (their own events); they
 * are one group by `groupSequence`. Grouping by the event id found no sibling
 * and shipped a broken undo on 2026-11-06, which is why the field names now
 * say which is which.
 */
export function undoPossessionTeamOfGroup(
  row: LogRow,
  rows: LogRow[],
  log: GameLog,
): string | null {
  const direct = undoPossessionTeam(row, log);
  // A row in the shared bucket (0) is a penalty, a clock or a marker: no group
  // and nothing that ever moved the ball.
  if (direct !== null || row.groupSequence === 0) {
    return direct;
  }
  for (const sibling of rows) {
    // by key, not identity: the screen rebuilds the row objects on every log
    if (
      sibling.key !== row.key &&
      !sibling.isDeleted &&
      sibling.groupSequence === row.groupSequence
    ) {
      const team = undoPossessionTeam(sibling, log);
      if (team !== null) {
        return team;
      }
    }
  }
  return null;
}
