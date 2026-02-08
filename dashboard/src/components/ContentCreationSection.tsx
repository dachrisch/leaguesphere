import React from 'react';
import { Card, Row, Col, ListGroup } from 'react-bootstrap';
import type { ContentCreation } from '../types/dashboard';

interface ContentCreationSectionProps {
  data: ContentCreation | null;
  loading: boolean;
}

const ContentCreationSection: React.FC<ContentCreationSectionProps> = ({ data, loading }) => {
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

  return (
    <>
      <h2 className="mb-3">Content Creation (Last 30 Days)</h2>
      <Row className="mb-4">
        {/* Gamedays Published */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>📅 Gamedays Published</strong>
            </Card.Header>
            <Card.Body>
              <h3 className="mb-3">{data.gamedays_published} gamedays</h3>
              <p className="text-muted small mb-3">
                Average: {data.avg_games_per_gameday} games per gameday
              </p>

              {data.top_publishers.length > 0 && (
                <>
                  <h6 className="mb-2">Top Publishers:</h6>
                  <ListGroup variant="flush">
                    {data.top_publishers.map((publisher, index) => (
                      <ListGroup.Item key={index} className="border-0 px-0 py-1">
                        <div className="d-flex justify-content-between">
                          <span>{index + 1}. {publisher.name}</span>
                          <strong>{publisher.count}</strong>
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Roster Activity */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>👥 Roster Activity</strong>
            </Card.Header>
            <Card.Body>
              <h3 className="mb-3">{data.new_players + data.transfers + data.players_left} changes</h3>

              <div className="mb-3">
                <div className="d-flex justify-content-between mb-1">
                  <span>• {data.new_players} players added</span>
                </div>
                <div className="d-flex justify-content-between mb-1">
                  <span>• {data.transfers} transfers</span>
                </div>
                <div className="d-flex justify-content-between mb-1">
                  <span>• {data.players_left} players removed</span>
                </div>
              </div>

              {data.top_teams_roster.length > 0 && (
                <>
                  <h6 className="mb-2">Most Active Teams:</h6>
                  <ListGroup variant="flush">
                    {data.top_teams_roster.map((team, index) => (
                      <ListGroup.Item key={index} className="border-0 px-0 py-1">
                        <div className="d-flex justify-content-between">
                          <span>{index + 1}. {team.name}</span>
                          <strong>{team.changes} changes</strong>
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Passcheck Verifications */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>✅ Passcheck Verifications</strong>
            </Card.Header>
            <Card.Body>
              <h3 className="mb-3">{data.verifications} verifications</h3>
              <p className="text-muted">
                Total roster verifications performed by officials in the last 30 days.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default ContentCreationSection;
