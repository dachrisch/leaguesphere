import React, { useState } from 'react';
import { LeagueAdoptionStat } from '../types';
import './GameCreationStats.css';

interface LeagueAdoptionBreakdownProps {
  leagueData: LeagueAdoptionStat[];
  timeWindowDays: string;
}

type SortField = 'league_name' | 'designer_percentage' | 'designer' | 'legacy';
type SortOrder = 'asc' | 'desc';

/**
 * Helper to determine adoption color
 */
function getAdoptionColor(percentage: number): string {
  if (percentage >= 25) return '#28a745'; // Green
  if (percentage >= 10) return '#fd7e14'; // Orange
  return '#6c757d'; // Gray
}

/**
 * Sort indicator component
 */
interface SortIndicatorProps {
  field: SortField;
  sortField: SortField;
  sortOrder: SortOrder;
}

const SortIndicator: React.FC<SortIndicatorProps> = ({ field, sortField, sortOrder }) => {
  if (sortField !== field) return <span className="sort-icon">⇅</span>;
  return (
    <span className="sort-icon active">
      {sortOrder === 'asc' ? '↑' : '↓'}
    </span>
  );
};

/**
 * Sortable table showing per-league adoption breakdown
 */
export const LeagueAdoptionBreakdown: React.FC<LeagueAdoptionBreakdownProps> = ({
  leagueData,
  timeWindowDays,
}) => {
  const [sortField, setSortField] = useState<SortField>('designer_percentage');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedData = [...leagueData].sort((a, b) => {
    let aValue: number | string = a[sortField];
    let bValue: number | string = b[sortField];

    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = (b[sortField] as string).toLowerCase();
    }

    const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="league-adoption-breakdown">
      <h4 className="breakdown-title">Adoption by League</h4>

      <div className="table-wrapper">
        <table className="adoption-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('league_name')} className="sortable">
                League <SortIndicator field="league_name" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('designer')} className="sortable number">
                Designer <SortIndicator field="designer" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('legacy')} className="sortable number">
                Legacy <SortIndicator field="legacy" sortField={sortField} sortOrder={sortOrder} />
              </th>
              <th onClick={() => handleSort('designer_percentage')} className="sortable number">
                % Designer <SortIndicator field="designer_percentage" sortField={sortField} sortOrder={sortOrder} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No data available for this time window
                </td>
              </tr>
            ) : (
              sortedData.map((league) => (
                <tr key={league.league_id}>
                  <td className="league-name">{league.league_name}</td>
                  <td className="number">{league.designer}</td>
                  <td className="number">{league.legacy}</td>
                  <td className="number adoption-indicator">
                    <span
                      className="adoption-badge"
                      style={{
                        backgroundColor: getAdoptionColor(league.designer_percentage),
                        color: 'white',
                      }}
                    >
                      {league.designer_percentage}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="breakdown-note">
        Data for {timeWindowDays === '7' ? 'last 7 days' : timeWindowDays === '30' ? 'last 30 days' : 'last 90 days'}
      </p>
    </div>
  );
};
