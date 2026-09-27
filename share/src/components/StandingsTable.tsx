import type { LeagueTable } from '../lib/types';

export function StandingsTable({
  table,
  highlightTeamIds,
}: {
  table: LeagueTable;
  highlightTeamIds: number[];
}) {
  return (
    <table className="share-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>Sp</th>
          <th>S</th>
          <th>U</th>
          <th>N</th>
          <th>P+</th>
          <th>P-</th>
          <th>Diff</th>
          <th>Pkt</th>
        </tr>
      </thead>
      <tbody>
        {table.standing.map((row) => (
          <tr
            key={row.team_id}
            className={
              highlightTeamIds.includes(row.team_id)
                ? 'share-table__row--highlight'
                : undefined
            }
          >
            <td>{row.standing}</td>
            <td>{row.team__description}</td>
            <td>{row.games_played}</td>
            <td>{row.wins}</td>
            <td>{row.draws}</td>
            <td>{row.losses}</td>
            <td>{row.pf}</td>
            <td>{row.pa}</td>
            <td>{row.diff}</td>
            <td>{row.win_points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
