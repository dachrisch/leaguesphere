import React from 'react';
import { Card } from 'react-bootstrap';

interface StatCardProps {
  icon: string;
  title: string;
  value: number | string;
  subtitle?: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, title, value, subtitle, color = 'primary' }) => {
  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex align-items-center">
          <div className="flex-shrink-0">
            <i className={`bi ${icon} fs-1 text-${color}`}></i>
          </div>
          <div className="flex-grow-1 ms-3">
            <h6 className="text-muted mb-1">{title}</h6>
            <h3 className="mb-0">{value}</h3>
            {subtitle && <small className="text-muted">{subtitle}</small>}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default StatCard;
