import React from 'react'
import { Row, Col, Spinner, Card, Accordion } from 'react-bootstrap'
import { AdminStats, LeagueHierarchy, TeamEntry, GamedaySummary } from '../types/dashboard'

interface Props {
  data: AdminStats | null
  loading: boolean
  leagueHierarchy: LeagueHierarchy[]
  teamsList: TeamEntry[]
}

function extractAllGamedays(leagueHierarchy: LeagueHierarchy[]): GamedaySummary[] {
  const result: GamedaySummary[] = []
  for (const league of leagueHierarchy) {
    for (const season of league.seasons) {
      for (const gd of season.gamedays) {
        result.push(gd)
      }
    }
  }
  return result
}

const AdminStatsCard: React.FC<Props> = ({ data, loading, leagueHierarchy, teamsList }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  if (!data) {
    return null
  }

  const allGamedays = extractAllGamedays(leagueHierarchy)

  return (
    <Row className="mb-4">
      <Col md={4} className="mb-3">
        <Card className="text-center border-primary h-100">
          <Card.Body>
            <i className="bi bi-calendar3 fs-1 text-primary"></i>
            <Card.Title className="mt-3 mb-0 fs-2">{data.gamedays}</Card.Title>
            <Card.Text className="text-muted">Gamedays</Card.Text>
          </Card.Body>
          <Accordion flush>
            <Accordion.Item eventKey="gamedays">
              <Accordion.Header>Show details</Accordion.Header>
              <Accordion.Body className="text-start p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {allGamedays.length === 0 ? (
                  <small className="text-muted">No gamedays available</small>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {allGamedays.map(gd => (
                      <li key={gd.id} className="mb-1">
                        <a href={`/gamedays/gameday/${gd.id}/`} className="small text-decoration-none">
                          {gd.name} <span className="text-muted">— {gd.date}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Card>
      </Col>
      <Col md={4} className="mb-3">
        <Card className="text-center border-success h-100">
          <Card.Body>
            <i className="bi bi-people-fill fs-1 text-success"></i>
            <Card.Title className="mt-3 mb-0 fs-2">{data.teams}</Card.Title>
            <Card.Text className="text-muted">Teams</Card.Text>
          </Card.Body>
          <Accordion flush>
            <Accordion.Item eventKey="teams">
              <Accordion.Header>Show details</Accordion.Header>
              <Accordion.Body className="text-start p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {teamsList.length === 0 ? (
                  <small className="text-muted">No teams available</small>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {teamsList.map(team => (
                      <li key={team.id} className="mb-1">
                        <a href={`/teammanager/team/${team.id}/`} className="small text-decoration-none">
                          {team.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Card>
      </Col>
      <Col md={4} className="mb-3">
        <Card className="text-center border-info h-100">
          <Card.Body>
            <i className="bi bi-controller fs-1 text-info"></i>
            <Card.Title className="mt-3 mb-0 fs-2">{data.games}</Card.Title>
            <Card.Text className="text-muted">Games</Card.Text>
          </Card.Body>
          <Accordion flush>
            <Accordion.Item eventKey="games">
              <Accordion.Header>Show details</Accordion.Header>
              <Accordion.Body className="text-start p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {allGamedays.length === 0 ? (
                  <small className="text-muted">No games available</small>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {allGamedays.map(gd => (
                      <li key={gd.id} className="mb-1">
                        <a href={`/gamedays/gameday/${gd.id}/`} className="small text-decoration-none">
                          {gd.name} <span className="text-muted">({gd.date})</span>
                          {' '}&mdash; {gd.game_count} games
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Card>
      </Col>
    </Row>
  )
}

export default AdminStatsCard
