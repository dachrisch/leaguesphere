import React from 'react';
import { Card, Row, Col, ListGroup, Badge } from 'react-bootstrap';
import type { RecentAction, OnlineUser } from '../types/dashboard';

interface RecentActivityFeedProps {
  recentActivity: RecentAction[];
  onlineUsers: OnlineUser[];
  loading: boolean;
}

const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  recentActivity,
  onlineUsers,
  loading,
}) => {
  const getTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getActionIcon = (actionType: string): string => {
    switch (actionType) {
      case 'passcheck_verification':
        return '✅';
      case 'player_transfer':
        return '🔄';
      case 'game_created':
        return '📝';
      case 'gameday_published':
        return '📅';
      default:
        return '•';
    }
  };

  if (loading) {
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
      <h2 className="mb-3">User Activity Timeline</h2>
      <Row className="mb-4">
        {/* Recent Actions Feed */}
        <Col md={8} className="mb-3">
          <Card>
            <Card.Header>
              <strong>Recent Activity</strong>
              <span className="text-muted small ms-2">(Last 24 hours)</span>
            </Card.Header>
            <Card.Body style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {recentActivity.length === 0 ? (
                <p className="text-muted text-center">No recent activity</p>
              ) : (
                <ListGroup variant="flush">
                  {recentActivity.map((action, index) => (
                    <ListGroup.Item key={index} className="border-0 py-2">
                      <div className="d-flex">
                        <div className="me-2" style={{ fontSize: '1.2rem' }}>
                          {getActionIcon(action.action_type)}
                        </div>
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <strong>{action.user_name}</strong>
                              <Badge bg="secondary" className="ms-2 small">
                                {action.user_role}
                              </Badge>
                            </div>
                            <span className="text-muted small">{getTimeAgo(action.action_time)}</span>
                          </div>
                          <div className="text-muted small">{action.description}</div>
                        </div>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Online Users Right Now */}
        <Col md={4} className="mb-3">
          <Card>
            <Card.Header>
              <strong>Online Users</strong>
              <span className="text-muted small ms-2">(Last 15 min)</span>
            </Card.Header>
            <Card.Body>
              {onlineUsers.length === 0 ? (
                <p className="text-muted text-center">No users online</p>
              ) : (
                <>
                  <p className="mb-3">
                    <Badge bg="success">{onlineUsers.length}</Badge> user{onlineUsers.length !== 1 ? 's' : ''} active
                  </p>
                  <ListGroup variant="flush">
                    {onlineUsers.map((user, index) => (
                      <ListGroup.Item key={index} className="border-0 px-0 py-2">
                        <div>
                          <i className="bi bi-person-fill text-success me-2"></i>
                          <strong>{user.user_name}</strong>
                        </div>
                        <div className="text-muted small ms-4">
                          {user.user_role} • {user.team}
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default RecentActivityFeed;
