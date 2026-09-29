import { Fragment } from 'react';

import type { LeagueTable, StandingRow } from '../lib/types';

interface StandingGroup {
  name: string;
  rows: StandingRow[];
}

function groupStandings(rows: StandingRow[]): StandingGroup[] {
  const groups: StandingGroup[] = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (current !== undefined && current.name === row.standing) {
      current.rows.push(row);
    } else {
      groups.push({ name: row.standing, rows: [row] });
    }
  }
  return groups;
}

export function StandingsTable({
  table,
  highlightTeamIds,
}: {
  table: LeagueTable;
  highlightTeamIds: number[];
}) {
  const groups = groupStandings(table.standing);
  const showGroups = groups.length > 1;

  return (
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
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <Fragment key={`${group.name}-${group.rows[0].team_id}`}>
            {showGroups && (
              <tr className="share-table__group">
                <td colSpan={10}>{group.name}</td>
              </tr>
            )}
            {group.rows.map((row, index) => (
              <tr
                key={row.team_id}
                className={
                  highlightTeamIds.includes(row.team_id)
                    ? 'share-table__row--highlight'
                    : undefined
                }
              >
                <td>{index + 1}</td>
                <td>{row.team__description}</td>
                <td>{row.games_played}</td>
                <td>{row.wins}</td>
                <td>{row.draws}</td>
                <td>{row.losses}</td>
                <td>{row.pf}</td>
                <td>{row.pa}</td>
                <td>{row.diff}</td>
                <td className="fw-semibold">{row.win_points}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
