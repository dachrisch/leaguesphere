import { Card } from 'react-bootstrap'

interface StatCardProps {
  icon: string
  title: string
  value: number
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ icon, title, value, color }) => {
  return (
    <Card className={`text-center border-${color}`}>
      <Card.Body>
        <i className={`bi ${icon} fs-1 text-${color}`}></i>
        <Card.Title className="mt-3 mb-0 fs-2">{value}</Card.Title>
        <Card.Text className="text-muted">{title}</Card.Text>
      </Card.Body>
    </Card>
  )
}

export default StatCard
