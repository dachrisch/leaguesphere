import React from 'react';
import { Card, Row, Col, Badge } from 'react-bootstrap';
import type { PlatformHealth } from '../types/dashboard';

interface PlatformHealthCardsProps {
  data: PlatformHealth | null;
  loading: boolean;
}

const PlatformHealthCards: React.FC<PlatformHealthCardsProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <Row className="mb-4">
        <Col md={3}>
          <Card className="text-center">
            <Card.Body>
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    );
  }

  const getActivityColor = (count: number): string => {
    if (count >= 10) return 'success';
    if (count >= 5) return 'warning';
    return 'danger';
  };

  const getTrendIcon = (trend: number): string => {
    if (trend > 0) return '↑';
    if (trend < 0) return '↓';
    return '→';
  };

  const getTrendColor = (trend: number): string => {
    if (trend > 0) return 'success';
    if (trend < 0) return 'danger';
    return 'secondary';
  };

  return (
    <>
      <h2 className="mb-3">Platform Health</h2>
      <Row className="mb-4">
        {/* Card 1: Active Users Today */}
        <Col md={3} className="mb-3">
          <Card className="text-center h-100">
            <Card.Body>
              <div className="mb-2">
                <i className="bi bi-person-check-fill" style={{ fontSize: '2rem', color: '#0d6efd' }}></i>
              </div>
              <Card.Title className="mb-1">Active Users Today</Card.Title>
              <h2 className="mb-1">
                <Badge bg={getActivityColor(data.active_today)}>{data.active_today}</Badge>
              </h2>
              <Card.Text className="text-muted small">Created content today</Card.Text>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 2: Active Users (7 days) */}
        <Col md={3} className="mb-3">
          <Card className="text-center h-100">
            <Card.Body>
              <div className="mb-2">
                <i className="bi bi-graph-up-arrow" style={{ fontSize: '2rem', color: '#198754' }}></i>
              </div>
              <Card.Title className="mb-1">Active Users (7 days)</Card.Title>
              <h2 className="mb-1">{data.active_7d}</h2>
              <Card.Text className="text-muted small">
                <Badge bg={getTrendColor(data.trend_7d)}>
                  {getTrendIcon(data.trend_7d)} {data.trend_7d > 0 ? '+' : ''}{data.trend_7d}%
                </Badge>
                {' '}vs. previous week
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 3: Total Users */}
        <Col md={3} className="mb-3">
          <Card className="text-center h-100">
            <Card.Body>
              <div className="mb-2">
                <i className="bi bi-people-fill" style={{ fontSize: '2rem', color: '#6c757d' }}></i>
              </div>
              <Card.Title className="mb-1">Total Users</Card.Title>
              <h2 className="mb-1">{data.total_users}</h2>
              <Card.Text className="text-muted small">
                <div>{data.team_managers} Team Managers</div>
                <div>{data.officials} Officials</div>
                <div>{data.players} Players</div>
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        {/* Card 4: User Growth */}
        <Col md={3} className="mb-3">
          <Card className="text-center h-100">
            <Card.Body>
              <div className="mb-2">
                <i className="bi bi-person-plus-fill" style={{ fontSize: '2rem', color: '#0dcaf0' }}></i>
              </div>
              <Card.Title className="mb-1">User Growth</Card.Title>
              <h2 className="mb-1">
                {data.new_users_30d > 0 ? (
                  <Badge bg="success">+{data.new_users_30d}</Badge>
                ) : (
                  <Badge bg="warning">{data.new_users_30d}</Badge>
                )}
              </h2>
              <Card.Text className="text-muted small">
                Last 30 days (~{data.avg_new_per_week} per week)
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default PlatformHealthCards;
