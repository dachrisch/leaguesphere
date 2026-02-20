import React from 'react'
import { Card, Spinner } from 'react-bootstrap'
import { GamesPerLeague } from '../types/dashboard'

interface Props {
  data: GamesPerLeague[]
  loading: boolean
}

const GamesPerLeagueCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1

  return (
    <Card className="h-100">
      <Card.Header className="bg-primary text-white">
        <Card.Title className="mb-0">GAMES PER LEAGUE</Card.Title>
      </Card.Header>
      <Card.Body>
        {data.length === 0 ? (
          <p className="text-muted mb-0">No data available</p>
        ) : (
          data.map(item => (
            <div key={item.league_id || item.league_name} className="mb-3">
              <div className="d-flex justify-content-between mb-1">
                <span className="text-secondary">{item.league_name}</span>
                <span className="fw-bold">{item.count}</span>
              </div>
              <div
                className="bg-light rounded"
                style={{
                  height: '8px',
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="bg-primary"
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

export default GamesPerLeagueCard
