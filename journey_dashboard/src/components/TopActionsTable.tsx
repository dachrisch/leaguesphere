import React, { useState } from 'react';
import { StatsResponse } from '../types';

interface TopActionsTableProps {
  stats: StatsResponse | null;
  loading: boolean;
}

export const TopActionsTable: React.FC<TopActionsTableProps> = ({ stats, loading }) => {
  const [range, setRange] = useState('7d');

  if (loading) return <div>Loading...</div>;
  if (!stats) return null;

  return (
    <div className="top-actions-table" style={{ marginBottom: '24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <h3>Top Actions (last {range === '7d' ? '7 days' : '30 days'})</h3>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>Action</th>
            <th style={{ textAlign: 'right', padding: '8px' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {stats.stats.map((stat) => (
            <tr key={stat.event_name} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px' }}>{stat.event_name}</td>
              <td style={{ textAlign: 'right', padding: '8px', fontWeight: 'bold' }}>{stat.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
