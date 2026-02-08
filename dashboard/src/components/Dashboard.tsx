import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Container, Row, Col, Alert, Button } from 'react-bootstrap'
import { DashboardApi } from '../utils/api'
import {
  AdminStats,
  SpieleProLiga,
  TeamsProLiga,
  SchiedsrichterProTeam,
  TeamsProLandesverband,
} from '../types/dashboard'
import AdminStatsCard from './AdminStatsCard'
import SpieleProLigaCard from './SpieleProLigaCard'
import TeamsProLigaCard from './TeamsProLigaCard'
import TeamsProLandesverbandCard from './TeamsProLandesverbandCard'
import SchiedsrichterProTeamCard from './SchiedsrichterProTeamCard'

const Dashboard: React.FC = () => {
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [spieleProLiga, setSpieleProLiga] = useState<SpieleProLiga[]>([])
  const [teamsProLiga, setTeamsProLiga] = useState<TeamsProLiga[]>([])
  const [teamsProLandesverband, setTeamsProLandesverband] = useState<
    TeamsProLandesverband[]
  >([])
  const [schiedsrichterProTeam, setSchiedsrichterProTeam] = useState<
    SchiedsrichterProTeam[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const api = useMemo(() => new DashboardApi(), [])

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all admin data in parallel
      const [stats, spiele, teams, landesverband, schiedsrichter] =
        await Promise.all([
          api.getAdminStats(),
          api.getSpieleProLiga(),
          api.getTeamsProLiga(),
          api.getTeamsProLandesverband(),
          api.getSchiedsrichterProTeam(),
        ])

      setAdminStats(stats.stats)
      setSpieleProLiga(spiele)
      setTeamsProLiga(teams)
      setTeamsProLandesverband(landesverband)
      setSchiedsrichterProTeam(schiedsrichter)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fehler beim Laden der Dashboard-Daten'
      )
      console.error('Dashboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchAdminData()
  }, [fetchAdminData])

  return (
    <Container fluid className="py-4">
      <div className="mb-4 d-flex justify-content-between align-items-center">
        <h1 className="mb-0">Admin Dashboard</h1>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={fetchAdminData}
          disabled={loading}
        >
          {loading ? 'Aktualisierung...' : 'Aktualisieren'}
        </Button>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <strong>Fehler:</strong> {error}
        </Alert>
      )}

      {/* Admin Stats Cards */}
      <AdminStatsCard data={adminStats} loading={loading} />

      {/* Two-Column Layout */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <SpieleProLigaCard data={spieleProLiga} loading={loading} />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsProLigaCard data={teamsProLiga} loading={loading} />
        </Col>
      </Row>

      {/* Full-Width Cards */}
      <Row className="mb-4">
        <Col lg={6} className="mb-3">
          <SchiedsrichterProTeamCard
            data={schiedsrichterProTeam}
            loading={loading}
          />
        </Col>
        <Col lg={6} className="mb-3">
          <TeamsProLandesverbandCard
            data={teamsProLandesverband}
            loading={loading}
          />
        </Col>
      </Row>

      <div className="text-center text-muted small mt-4">
        <p>Dashboard aktualisiert: {new Date().toLocaleString('de-DE')}</p>
      </div>
    </Container>
  )
}

export default Dashboard
