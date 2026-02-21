import React from 'react'
import { Card, Spinner } from 'react-bootstrap'
import { TeamsPerAssociation } from '../types/dashboard'

interface Props {
  data: TeamsPerAssociation[]
  loading: boolean
}

const TeamsPerAssociationCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1

  return (
    <Card className="h-100">
      <Card.Header className="bg-warning text-dark">
        <Card.Title className="mb-0">TEAMS PER ASSOCIATION</Card.Title>
      </Card.Header>
      <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {data.length === 0 ? (
          <p className="text-muted mb-0">No data available</p>
        ) : (
          data.map(item => (
            <div key={item.association_id || item.association_name} className="mb-2">
              <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.9rem' }}>
                <span className="text-secondary">{item.association_name}</span>
                <span className="fw-bold">{item.count}</span>
              </div>
              <div
                className="bg-light rounded"
                style={{
                  height: '6px',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="bg-warning"
                  style={{
                    height: '100%',
                    width: `${(item.count / maxCount) * 100}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card.Body>
    </Card>
  )
}

export default TeamsPerAssociationCard
