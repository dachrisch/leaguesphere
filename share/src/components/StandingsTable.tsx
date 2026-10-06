import { Fragment } from 'react';

import { ranksByQuotient } from '../lib/table';
import type { LeagueTable, StandingRow } from '../lib/types';

interface StandingGroup {
  name: string | null;
  rows: StandingRow[];
}

function groupStandings(rows: StandingRow[]): StandingGroup[] {
  const groups: StandingGroup[] = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (current !== undefined && current.name === row.group) {
      current.rows.push(row);
    } else {
      groups.push({ name: row.group, rows: [row] });
    }
  }
  return groups;
}

function formatQuotient(value: number): string {
  // German decimal comma, without relying on runtime ICU data: Node's
  // small-icu build (CI, some test envs) lacks de-DE, so toLocaleString
  // silently falls back to en-US ('0.625'). toFixed is deterministic.
  return value.toFixed(3).replace('.', ',');
}

export function StandingsTable({
  table,
  highlightTeamIds,
}: {
  table: LeagueTable;
  highlightTeamIds: number[];
}) {
  const groups = groupStandings(table.rows);
  const showGroups = groups.length > 1;
  // Tables ranked by league quotient would read as mis-sorted by points
  // without the quotient next to them.
  const showQuotient = ranksByQuotient(table);
  const columnCount = showQuotient ? 11 : 10;

  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover share-table mb-0">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Team</th>
            <th>Sp</th>
            <th>S</th>
            <th>U</th>
            <th>N</th>
            <th>EP</th>
            <th>GP</th>
            <th>Diff</th>
            <th>Pkt</th>
            {showQuotient && <th title="Ligaquotient">Quote</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={`${group.name ?? ''}-${group.rows[0].team_id}`}>
              {showGroups && (
                <tr className="share-table__group">
                  <td colSpan={columnCount}>{group.name ?? ''}</td>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr
                  key={row.team_id}
                  className={
                    highlightTeamIds.includes(row.team_id)
                      ? 'share-table__row--highlight'
                      : undefined
                  }
                >
                  <td>{row.rank}</td>
                  <td>{row.team__description}</td>
                  <td>{row.games_played}</td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.pf}</td>
                  <td>{row.pa}</td>
                  <td>{row.diff}</td>
                  <td className={showQuotient ? undefined : 'fw-semibold'}>
                    {row.win_points}
                  </td>
                  {showQuotient && (
                    <td className="fw-semibold">
                      {formatQuotient(row.win_quotient)}
                    </td>
                  )}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
