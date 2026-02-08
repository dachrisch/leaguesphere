import React from 'react';
import { Card, Row, Col, ProgressBar, Badge } from 'react-bootstrap';
import type { FeatureUsage } from '../types/dashboard';

interface FeatureUsageSectionProps {
  data: FeatureUsage | null;
  loading: boolean;
}

const FeatureUsageSection: React.FC<FeatureUsageSectionProps> = ({ data, loading }) => {
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

  const getAdoptionStatus = (rate: number): { label: string; variant: string; icon: string } => {
    if (rate >= 60) return { label: 'Healthy adoption', variant: 'success', icon: '🟢' };
    if (rate >= 30) return { label: 'Moderate adoption', variant: 'warning', icon: '🟡' };
    return { label: 'Low adoption', variant: 'danger', icon: '🔴' };
  };

  const scorecardStatus = getAdoptionStatus(data.scorecard_adoption);
  const livetickerStatus = getAdoptionStatus(data.liveticker_adoption);

  return (
    <>
      <h2 className="mb-3">Feature Usage Breakdown</h2>
      <Row className="mb-4">
        {/* Scorecard */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>📊 Scorecard (Live Scoring)</strong>
            </Card.Header>
            <Card.Body>
              <h4 className="mb-3">{data.scorecard_adoption.toFixed(1)}% adoption</h4>

              <div className="mb-3">
                <p className="mb-1">Used in: <strong>{data.scorecard_games}</strong> games</p>
                <p className="mb-1">Events logged: <strong>{data.scorecard_events}</strong> total</p>
                <p className="mb-1">Average: <strong>{data.scorecard_avg_events}</strong> events per game</p>
              </div>

              <div className="mb-2">
                <ProgressBar now={data.scorecard_adoption} variant={scorecardStatus.variant} />
              </div>

              <p className="mb-0">
                <Badge bg={scorecardStatus.variant}>
                  {scorecardStatus.icon} {scorecardStatus.label}
                </Badge>
              </p>
            </Card.Body>
          </Card>
        </Col>

        {/* Liveticker */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>🎮 Liveticker (Game Status)</strong>
            </Card.Header>
            <Card.Body>
              <h4 className="mb-3">{data.liveticker_adoption.toFixed(1)}% adoption</h4>

              <div className="mb-3">
                <p className="mb-1">Used in: <strong>{data.liveticker_games}</strong> games</p>
                <p className="mb-1">Total games: <strong>{data.total_games}</strong></p>
              </div>

              <div className="mb-2">
                <ProgressBar now={data.liveticker_adoption} variant={livetickerStatus.variant} />
              </div>

              <p className="mb-0">
                <Badge bg={livetickerStatus.variant}>
                  {livetickerStatus.icon} {livetickerStatus.label}
                </Badge>
              </p>
            </Card.Body>
          </Card>
        </Col>

        {/* Passcheck */}
        <Col md={4} className="mb-3">
          <Card className="h-100">
            <Card.Header>
              <strong>✅ Passcheck (Roster Verification)</strong>
            </Card.Header>
            <Card.Body>
              <h4 className="mb-3">{data.passcheck_verifications} verifications</h4>

              <div className="mb-3">
                <p className="mb-1">Teams verified: <strong>{data.passcheck_teams}</strong></p>
                <p className="mb-1">
                  Usage frequency reflects administrative diligence in roster compliance.
                </p>
              </div>

              <p className="mb-0">
                <Badge bg="info">Compliance tracking</Badge>
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default FeatureUsageSection;
