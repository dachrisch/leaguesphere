import React from 'react';
import { Table, Badge } from 'react-bootstrap';
import type { LiveGame } from '../types/dashboard';

interface LiveGamesTableProps {
  games: LiveGame[];
}

const LiveGamesTable: React.FC<LiveGamesTableProps> = ({ games }) => {
  if (games.length === 0) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-info-circle fs-1 text-muted"></i>
        <p className="text-muted mt-3">No live games at the moment</p>
      </div>
    );
  }

  return (
    <Table striped bordered hover responsive>
      <thead>
        <tr>
          <th>League</th>
          <th>Home Team</th>
          <th>Score</th>
          <th>Away Team</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => (
          <tr key={game.game_id}>
            <td>{game.league}</td>
            <td className="fw-bold">{game.home_team}</td>
            <td className="text-center">
              <Badge bg="primary" className="fs-6">
                {game.score.home} - {game.score.away}
              </Badge>
            </td>
            <td className="fw-bold">{game.away_team}</td>
            <td>
              <Badge bg={game.status === "1. Halbzeit" ? "success" : "warning"}>
                {game.status}
              </Badge>
            </td>
            <td>{new Date(game.gameday).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

export default LiveGamesTable;
