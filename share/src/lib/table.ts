import type { LeagueTable, Snapshot } from './types';

/**
 * Standings to show: the snapshot's tables for the seasons present in the
 * (possibly latest-season-filtered) gamedays, narrowed to an explicit
 * `league=` when the embed sets one. Leagues without a table (cups) never
 * appear: the snapshot only returns configured league-seasons.
 */
export function visibleStandings(
  snapshot: Snapshot,
  league: number | null
): LeagueTable[] {
  const seasons = new Set(snapshot.gamedays.map((gameday) => gameday.season));
  return (snapshot.standings ?? []).filter(
    (table) =>
      seasons.has(table.season.id) &&
      (league === null || table.league.id === league)
  );
}

/** Whether the table ranks by league quotient, so the column must show. */
export function ranksByQuotient(table: LeagueTable): boolean {
  return table.ranking[0] === 'win_quotient';
}
