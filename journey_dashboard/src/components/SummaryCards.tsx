import React from 'react';
import { StatsResponse } from '../types';

interface SummaryCardsProps {
  stats: StatsResponse | null;
  loading: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats, loading }) => {
  if (loading) return <div>Loading...</div>;
  if (!stats) return null;

  return (
    <div className="summary-cards" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
      <div className="card" style={cardStyle}>
        <div className="card-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a73e8' }}>
          {stats.total_events}
        </div>
        <div className="card-label">Events Today</div>
      </div>
      <div className="card" style={cardStyle}>
        <div className="card-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1a73e8' }}>
          {stats.unique_event_types}
        </div>
        <div className="card-label">Event Types</div>
      </div>
    </div>
  );
};

const cardStyle = {
  padding: '16px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  flex: 1,
  backgroundColor: '#f9f9f9',
};
