import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Button, Spinner, Alert } from 'react-bootstrap';
import { dashboardApi } from '../utils/api';
import type {
  PlatformHealth,
  RecentAction,
  OnlineUser,
  ContentCreation,
  FeatureUsage,
  UserSegments,
  ProblemAlerts,
} from '../types/dashboard';

// Import all new section components
import PlatformHealthCards from './PlatformHealthCards';
import RecentActivityFeed from './RecentActivityFeed';
import ContentCreationSection from './ContentCreationSection';
import FeatureUsageSection from './FeatureUsageSection';
import UserSegmentsSection from './UserSegmentsSection';
import ProblemAlertsSection from './ProblemAlertsSection';

const Dashboard: React.FC = () => {
  // State for all sections
  const [platformHealth, setPlatformHealth] = useState<PlatformHealth | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentAction[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [contentCreation, setContentCreation] = useState<ContentCreation | null>(null);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage | null>(null);
  const [userSegments, setUserSegments] = useState<UserSegments | null>(null);
  const [problemAlerts, setProblemAlerts] = useState<ProblemAlerts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all dashboard data in parallel
      const [
        healthData,
        activityData,
        onlineData,
        creationData,
        usageData,
        segmentsData,
        alertsData,
      ] = await Promise.all([
        dashboardApi.getPlatformHealth(),
        dashboardApi.getRecentActivity(24, 20),
        dashboardApi.getOnlineUsers(15),
        dashboardApi.getContentCreation(30),
        dashboardApi.getFeatureUsage(30),
        dashboardApi.getUserSegments(),
        dashboardApi.getProblemAlerts(),
      ]);

      setPlatformHealth(healthData);
      setRecentActivity(activityData);
      setOnlineUsers(onlineData);
      setContentCreation(creationData);
      setFeatureUsage(usageData);
      setUserSegments(segmentsData);
      setProblemAlerts(alertsData);
    } catch (err) {
      setError('Failed to load dashboard data. Please try again.');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
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
          <Button variant="outline-danger" size="sm" className="ms-3" onClick={fetchDashboardData}>
            Retry
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      {/* Header */}
      <Row className="mb-4">
        <Col>
          <div className="d-flex justify-content-between align-items-center">
            <h1>Admin Dashboard</h1>
            <Button variant="outline-primary" onClick={fetchDashboardData}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Refresh
            </Button>
          </div>
        </Col>
      </Row>

      {/* Section 1: Platform Health */}
      <PlatformHealthCards data={platformHealth} loading={false} />

      {/* Section 2: User Activity Timeline */}
      <RecentActivityFeed
        recentActivity={recentActivity}
        onlineUsers={onlineUsers}
        loading={false}
      />

      {/* Section 3: Content Creation */}
      <ContentCreationSection data={contentCreation} loading={false} />

      {/* Section 4: Feature Usage */}
      <FeatureUsageSection data={featureUsage} loading={false} />

      {/* Section 5: User Segments */}
      <UserSegmentsSection data={userSegments} loading={false} />

      {/* Section 6: Problems & Alerts */}
      <ProblemAlertsSection data={problemAlerts} loading={false} />
    </Container>
  );
};

export default Dashboard;
