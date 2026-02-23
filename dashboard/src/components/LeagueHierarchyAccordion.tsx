import React from 'react'
import { Accordion, Badge, Row, Col, Card } from 'react-bootstrap'
import { LeagueHierarchy } from '../types/dashboard'

interface Props {
  data: LeagueHierarchy[]
  loading: boolean
}

const LeagueHierarchyAccordion: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="text-muted">No league hierarchy data available.</p>
  }

  return (
    <Card className="mb-4">
      <Card.Header className="bg-dark text-white d-flex justify-content-between align-items-center">
        <Card.Title className="mb-0">League Hierarchy</Card.Title>
        <small>{data.length} Leagues</small>
      </Card.Header>
      <Card.Body className="p-0">
        <Accordion flush>
          {data.map((league) => (
            <Accordion.Item eventKey={league.league_id.toString()} key={league.league_id}>
              <Accordion.Header>
                <div className="d-flex justify-content-between w-100 me-3">
                  <span className="fw-bold">{league.league_name}</span>
                  <div>
                    <Badge bg="secondary" className="me-2">
                      {league.seasons_count} Seasons
                    </Badge>
                    <Badge bg="info">
                      {league.total_gamedays} Gamedays
                    </Badge>
                  </div>
                </div>
              </Accordion.Header>
              <Accordion.Body className="bg-light">
                <Row className="g-3">
                  {league.seasons.map((season) => (
                    <Col key={season.season_id} xs={12}>
                      <Card className="border-0 shadow-sm">
                        <Card.Body className="py-2 px-3">
                          <Row className="align-items-center">
                            <Col md={4}>
                              <span className="fw-bold">{season.season_name}</span>
                            </Col>
                            <Col md={8}>
                              <div className="d-flex flex-wrap gap-2 justify-content-md-end">
                                <Badge bg="light" text="dark" className="border border-primary">
                                  {season.gamedays_count} Gamedays
                                </Badge>
                                <Badge bg="light" text="dark" className="border">
                                  Avg Teams/Gameday: {season.avg_teams_per_gameday}
                                </Badge>
                                <Badge bg="light" text="dark" className="border">
                                  Games/Gameday: {season.avg_games_per_gameday}
                                </Badge>
                              </div>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Accordion.Body>
            </Accordion.Item>
          ))}
        </Accordion>
      </Card.Body>
    </Card>
  )
}

export default LeagueHierarchyAccordion
