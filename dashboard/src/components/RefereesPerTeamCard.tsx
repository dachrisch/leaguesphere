import React from 'react'
import { Card, Spinner, ListGroup } from 'react-bootstrap'
import { RefereesPerTeam } from '../types/dashboard'

interface Props {
  data: RefereesPerTeam[]
  loading: boolean
}

const RefereesPerTeamCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <Card className="h-100">
      <Card.Header className="bg-info text-white">
        <Card.Title className="mb-0">REFEREES PER TEAM</Card.Title>
      </Card.Header>
      <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {sortedData.length === 0 ? (
          <p className="text-muted mb-0">No data available</p>
        ) : (
          <ListGroup variant="flush">
            {sortedData.map(item => (
              <ListGroup.Item
                key={item.team_id}
                className="d-flex justify-content-between align-items-center px-0 border-bottom"
              >
                <span>{item.team_name}</span>
                <span
                  className="badge bg-info"
                  style={{ fontSize: '0.9rem', padding: '0.5rem 0.75rem' }}
                >
                  {item.count}
                </span>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  )
}

export default RefereesPerTeamCard
