import React from 'react';
import { Card, Table, Badge } from 'react-bootstrap';
import type { UsersPerTeam } from '../types/dashboard';

interface UsersPerTeamCardProps {
  data: UsersPerTeam | null;
  loading: boolean;
}

const UsersPerTeamCard: React.FC<UsersPerTeamCardProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <Card className="h-100">
        <Card.Header>
          <strong>👥 Users per Team</strong>
        </Card.Header>
        <Card.Body className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="h-100">
      <Card.Header>
        <strong>👥 Users per Team</strong>
      </Card.Header>
      <Card.Body>
        <div className="mb-3">
          <p className="mb-1">
            <strong>{data.total_teams_with_users}</strong> teams with users
          </p>
          <p className="mb-1">
            <strong>{data.total_users_with_teams}</strong> users assigned to teams
          </p>
          {data.users_without_team > 0 && (
            <p className="mb-0 text-muted">
              <Badge bg="warning" text="dark">{data.users_without_team}</Badge> users without team
            </p>
          )}
        </div>

        {data.teams.length > 0 && (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <Table hover size="sm" className="mb-0">
              <thead className="sticky-top bg-white">
                <tr>
                  <th>Team</th>
                  <th>Association</th>
                  <th className="text-end">Users</th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team, index) => (
                  <tr key={index}>
                    <td>
                      <strong>{team.team_name}</strong>
                    </td>
                    <td className="text-muted small">{team.association}</td>
                    <td className="text-end">
                      <Badge bg="primary">{team.user_count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {data.teams.length === 0 && (
          <p className="text-muted text-center mb-0">No teams with users</p>
        )}
      </Card.Body>
    </Card>
  );
};

export default UsersPerTeamCard;
