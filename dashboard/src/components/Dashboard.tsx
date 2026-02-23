import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Container, Row, Col, Alert, Button } from 'react-bootstrap'
import { DashboardApi } from '../utils/api'
import {
  AdminStats,
  AdminDashboardData,
  GamesPerLeague,
  TeamsPerLeague,
  RefereesPerTeam,
  TeamsPerAssociation,
  LeagueHierarchy,
  GamedaySchedule,
} from '../types/dashboard'
import AdminStatsCard from './AdminStatsCard'
import GamesPerLeagueCard from './GamesPerLeagueCard'
import TeamsPerLeagueCard from './TeamsPerLeagueCard'
import TeamsPerAssociationCard from './TeamsPerAssociationCard'
import RefereesPerTeamCard from './RefereesPerTeamCard'
import LeagueHierarchyAccordion from './LeagueHierarchyAccordion'
import GamedayCalendar from './GamedayCalendar'

const Dashboard: React.FC = () => {
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [adminDashboardData, setAdminDashboardData] = useState<AdminDashboardData | null>(null)
  const [gamedaySchedule, setGamedaySchedule] = useState<GamedaySchedule | null>(null)
  const [gamesPerLeague, setGamesPerLeague] = useState<GamesPerLeague[]>([])
  const [teamsPerLeague, setTeamsPerLeague] = useState<TeamsPerLeague[]>([])
  const [teamsPerAssociation, setTeamsPerAssociation] = useState<
    TeamsPerAssociation[]
  >([])
  const [refereesPerTeam, setRefereesPerTeam] = useState<
    RefereesPerTeam[]
  >([])
  const [leagueHierarchy, setLeagueHierarchy] = useState<LeagueHierarchy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const api = useMemo(() => new DashboardApi(), [])

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all admin data in parallel
      const [stats, games, teams, association, referees, hierarchy] =
        await Promise.all([
          api.getAdminStats(),
          api.getGamesPerLeague(),
          api.getTeamsPerLeague(),
          api.getTeamsPerAssociation(),
          api.getRefereesPerTeam(),
          api.getLeagueHierarchy(),
        ])

      setAdminStats(stats.stats)
      setAdminDashboardData(stats)
      setGamedaySchedule(stats.gameday_schedule ?? null)
      setGamesPerLeague(games)
      setTeamsPerLeague(teams)
      setTeamsPerAssociation(association)
      setRefereesPerTeam(referees)
      setLeagueHierarchy(hierarchy)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error loading dashboard data'
      )
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void fetchAdminData()
  }, [fetchAdminData])

  return (
    <Container fluid className="py-4">
      <div className="mb-4 d-flex justify-content-between align-items-center">
        <h1 className="mb-0">Admin Dashboard</h1>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => { void fetchAdminData() }}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <strong>Error:</strong> {error}
        </Alert>
      )}

      {/* Admin Stats Cards */}
      <AdminStatsCard
        data={adminStats}
        loading={loading}
        leagueHierarchy={leagueHierarchy}
        teamsList={adminDashboardData?.teams_list ?? []}
      />

      {/* Gameday Calendar Row */}
      <Row className="mb-4">
        <Col>
          <GamedayCalendar data={gamedaySchedule} loading={loading} />
        </Col>
      </Row>

      {/* League Hierarchy View */}
      <Row className="mb-4">
        <Col>
          <LeagueHierarchyAccordion data={leagueHierarchy} loading={loading} />
        </Col>
      </Row>

      {/* Two-Column Layout */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <GamesPerLeagueCard data={gamesPerLeague} loading={loading} />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsPerLeagueCard data={teamsPerLeague} loading={loading} />
        </Col>
      </Row>

      {/* Full-Width Cards */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <RefereesPerTeamCard
            data={refereesPerTeam}
            loading={loading}
          />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsPerAssociationCard
            data={teamsPerAssociation}
            loading={loading}
          />
        </Col>
      </Row>

      <div className="text-center text-muted small mt-4">
        <p>Dashboard updated: {new Date().toLocaleString('en-US')}</p>
      </div>
    </Container>
  )
}

export default Dashboard
