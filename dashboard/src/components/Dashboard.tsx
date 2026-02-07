import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Spinner, Alert } from 'react-bootstrap';
import { dashboardApi } from '../utils/api';
import type { DashboardSummary, LiveGame } from '../types/dashboard';
import StatCard from './StatCard';
import LiveGamesTable from './LiveGamesTable';

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, gamesData] = await Promise.all([
        dashboardApi.getSummary(),
        dashboardApi.getLiveGames(),
      ]);
      setSummary(summaryData);
      setLiveGames(gamesData);
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert variant="danger">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
          <Button variant="outline-danger" size="sm" className="ms-3" onClick={fetchData}>
            Retry
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <div className="d-flex justify-content-between align-items-center">
            <h2>Dashboard Overview</h2>
            <Button variant="outline-primary" onClick={fetchData}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Refresh
            </Button>
          </div>
        </Col>
      </Row>

      {summary && (
        <Row className="g-4 mb-4">
          <Col md={6} lg={3}>
            <StatCard
              icon="bi-controller"
              title="Total Games"
              value={summary.total_games}
            />
          </Col>
          <Col md={6} lg={3}>
            <StatCard
              icon="bi-broadcast"
              title="Live Games"
              value={summary.live_games}
              subtitle={summary.live_games > 0 ? "Currently in progress" : "None active"}
            />
          </Col>
          <Col md={6} lg={3}>
            <StatCard
              icon="bi-people"
              title="Total Teams"
              value={summary.total_teams}
            />
          </Col>
          <Col md={6} lg={3}>
            <StatCard
              icon="bi-person-check"
              title="Active Players"
              value={summary.total_players}
            />
          </Col>
        </Row>
      )}

      <Row className="mb-4">
        <Col>
          <Card>
            <Card.Header className="bg-primary text-white">
              <h5 className="mb-0">
                <i className="bi bi-broadcast-pin me-2"></i>
                Live Games
              </h5>
            </Card.Header>
            <Card.Body>
              <LiveGamesTable games={liveGames} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {summary && (
        <Row>
          <Col>
            <Card>
              <Card.Header>
                <h5 className="mb-0">
                  <i className="bi bi-graph-up me-2"></i>
                  Statistics
                </h5>
              </Card.Header>
              <Card.Body>
                <p>
                  <strong>Completion Rate:</strong>{' '}
                  <Badge bg={summary.completion_rate > 80 ? 'success' : 'warning'}>
                    {summary.completion_rate.toFixed(2)}%
                  </Badge>
                </p>
                <p className="text-muted mb-0">
                  Percentage of games with recorded results
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
};

export default Dashboard;
