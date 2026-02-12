import React from 'react';
import { Card, Row, Col, Table } from 'react-bootstrap';
import type { UserSegments } from '../types/dashboard';

interface UserSegmentsSectionProps {
  data: UserSegments | null;
  loading: boolean;
}

const UserSegmentsSection: React.FC<UserSegmentsSectionProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Body className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    );
  }

  const getActivityColor = (rate: number): string => {
    if (rate >= 30) return 'success';
    if (rate >= 15) return 'warning';
    return 'danger';
  };

  return (
    <>
      <h2 className="mb-3">User Segments</h2>
      <Row className="mb-4">
        {/* By Role */}
        <Col md={8} className="mb-3">
          <Card>
            <Card.Header>
              <strong>👥 User Breakdown by Role</strong>
            </Card.Header>
            <Card.Body>
              <Table hover responsive>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Total Users</th>
                    <th>Active (30 days)</th>
                    <th>Activity Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Team Managers</strong></td>
                    <td>{data.team_managers.total}</td>
                    <td>{data.team_managers.active_30d}</td>
                    <td>
                      <span className={`badge bg-${getActivityColor(data.team_managers.activity_rate)}`}>
                        {data.team_managers.activity_rate}%
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Officials</strong></td>
                    <td>{data.officials.total}</td>
                    <td>{data.officials.active_30d}</td>
                    <td>
                      <span className={`badge bg-${getActivityColor(data.officials.activity_rate)}`}>
                        {data.officials.activity_rate}%
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Players</strong></td>
                    <td>{data.players.total}</td>
                    <td>{data.players.active_30d}</td>
                    <td>
                      <span className={`badge bg-${getActivityColor(data.players.activity_rate)}`}>
                        {data.players.activity_rate}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>

        {/* Top Teams by Activity */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>🏆 Top 5 Active Teams</strong>
            </Card.Header>
            <Card.Body>
              {data.top_teams.length === 0 ? (
                <p className="text-muted">No team activity data</p>
              ) : (
                <Table size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th className="text-end">Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_teams.map((team, index) => (
                      <tr key={index}>
                        <td>
                          <div>{index + 1}. {team.name}</div>
                          <div className="text-muted small">
                            {team.roster_changes} roster • {team.verifications} verifications
                          </div>
                        </td>
                        <td className="text-end align-middle">
                          <strong>{team.total_activity}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default UserSegmentsSection;
