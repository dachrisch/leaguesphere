import { Row, Col, Spinner } from 'react-bootstrap'
import { AdminStats } from '../types/dashboard'
import StatCard from './StatCard'

interface Props {
  data: AdminStats | null
  loading: boolean
}

const AdminStatsCard: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <Spinner animation="border" role="status" />
  }

  if (!data) {
    return null
  }

  return (
    <Row className="mb-4">
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-calendar3"
          title="Gamedays"
          value={data.gamedays}
          color="primary"
        />
      </Col>
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-people-fill"
          title="Teams"
          value={data.teams}
          color="success"
        />
      </Col>
      <Col md={4} className="mb-3">
        <StatCard
          icon="bi-controller"
          title="Games"
          value={data.games}
          color="info"
        />
      </Col>
    </Row>
  )
}

export default AdminStatsCard
