import React from 'react';
import { Card, Row, Col, ListGroup, Badge, Alert } from 'react-bootstrap';
import type { ProblemAlerts } from '../types/dashboard';

interface ProblemAlertsSectionProps {
  data: ProblemAlerts | null;
  loading: boolean;
}

const ProblemAlertsSection: React.FC<ProblemAlertsSectionProps> = ({ data, loading }) => {
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

  const hasProblems =
    data.inactive_team_managers.total > 0 ||
    data.inactive_teams.total > 0 ||
    data.unused_accounts > 0;

  return (
    <>
      <h2 className="mb-3">Problems & Alerts</h2>
      {!hasProblems ? (
        <Row className="mb-4">
          <Col>
            <Alert variant="success">
              <i className="bi bi-check-circle-fill me-2"></i>
              <strong>All good!</strong> No major issues detected.
            </Alert>
          </Col>
        </Row>
      ) : (
        <Row className="mb-4">
          {/* Inactive Team Managers */}
          {data.inactive_team_managers.total > 0 && (
            <Col md={4} className="mb-3">
              <Card className="border-warning h-100">
                <Card.Header className="bg-warning text-dark">
                  <strong>⚠️ Inactive Team Managers</strong>
                </Card.Header>
                <Card.Body>
                  <h4 className="mb-3">
                    <Badge bg="danger">{data.inactive_team_managers.total}</Badge> inactive (30+ days)
                  </h4>

                  {data.inactive_team_managers.never_active.length > 0 && (
                    <div className="mb-3">
                      <h6 className="text-danger">🔴 Never Active:</h6>
                      <ListGroup variant="flush">
                        {data.inactive_team_managers.never_active.map((user, index) => (
                          <ListGroup.Item key={index} className="border-0 px-0 py-1 small">
                            <div><strong>{user.name}</strong></div>
                            <div className="text-muted">{user.team} • joined {user.joined_days_ago} days ago</div>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    </div>
                  )}

                  {data.inactive_team_managers.recently_inactive.length > 0 && (
                    <div className="mb-3">
                      <h6 className="text-warning">🟡 Recently Inactive:</h6>
                      <ListGroup variant="flush">
                        {data.inactive_team_managers.recently_inactive.map((user, index) => (
                          <ListGroup.Item key={index} className="border-0 px-0 py-1 small">
                            <div><strong>{user.name}</strong></div>
                            <div className="text-muted">{user.team}</div>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    </div>
                  )}

                  <Alert variant="info" className="mb-0 small">
                    <i className="bi bi-lightbulb-fill me-1"></i>
                    <strong>Action:</strong> Reach out for onboarding help
                  </Alert>
                </Card.Body>
              </Card>
            </Col>
          )}

          {/* Inactive Teams */}
          {data.inactive_teams.total > 0 && (
            <Col md={4} className="mb-3">
              <Card className="border-warning h-100">
                <Card.Header className="bg-warning text-dark">
                  <strong>⚠️ Inactive Teams</strong>
                </Card.Header>
                <Card.Body>
                  <h4 className="mb-3">
                    <Badge bg="danger">{data.inactive_teams.total}</Badge> teams (60+ days)
                  </h4>

                  <p className="text-muted small mb-3">
                    No games or roster changes in 60+ days
                  </p>

                  {data.inactive_teams.teams.length > 0 && (
                    <ListGroup variant="flush">
                      {data.inactive_teams.teams.map((team, index) => (
                        <ListGroup.Item key={index} className="border-0 px-0 py-1 small">
                          <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                          {team.name}
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}

                  <Alert variant="info" className="mb-0 small mt-3">
                    <i className="bi bi-lightbulb-fill me-1"></i>
                    <strong>Action:</strong> Check if teams are still active
                  </Alert>
                </Card.Body>
              </Card>
            </Col>
          )}

          {/* Unused Accounts */}
          {data.unused_accounts > 0 && (
            <Col md={4} className="mb-3">
              <Card className="border-warning h-100">
                <Card.Header className="bg-warning text-dark">
                  <strong>⚠️ Unused Accounts</strong>
                </Card.Header>
                <Card.Body>
                  <h4 className="mb-3">
                    <Badge bg="danger">{data.unused_accounts}</Badge> accounts
                  </h4>

                  <p className="text-muted small mb-3">
                    Accounts older than 30 days with zero lifetime activity
                  </p>

                  <Alert variant="info" className="mb-0 small">
                    <i className="bi bi-lightbulb-fill me-1"></i>
                    <strong>Action:</strong> Consider cleanup or follow-up email
                  </Alert>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>
      )}
    </>
  );
};

export default ProblemAlertsSection;
