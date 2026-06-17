import React, { useState } from 'react';
import { GameCreationStatsResponse, TimePeriodStats } from '../types';
import { LeagueAdoptionBreakdown } from './LeagueAdoptionBreakdown';
import './GameCreationStats.css';

interface GameCreationStatsProps {
  data: GameCreationStatsResponse;
  onTabChange?: (days: string) => void;
}

const DAYS_OPTIONS = ['7', '30', '90'];
const DAYS_LABELS: Record<string, string> = {
  '7': 'Last 7 Days',
  '30': 'Last 30 Days',
  '90': 'Last 90 Days',
};

/**
 * Helper to get adoption color based on percentage
 */
function getAdoptionColor(percentage: number): string {
  if (percentage >= 25) return '#28a745'; // Green for high adoption
  if (percentage >= 10) return '#fd7e14'; // Orange for medium
  return '#6c757d'; // Gray for low/none
}

/**
 * Main Games Created card showing designer vs legacy split
 */
export const GameCreationStats: React.FC<GameCreationStatsProps> = ({
  data,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>('30');
  const [expandedLeague, setExpandedLeague] = useState<boolean>(false);

  const stats: TimePeriodStats = data.summary[activeTab];

  const handleTabClick = (days: string) => {
    setActiveTab(days);
    onTabChange?.(days);
  };

  if (!stats) {
    return (
      <div className="games-created-card loading">
        <p>Loading game creation stats...</p>
      </div>
    );
  }

  const designerColor = getAdoptionColor(stats.designer_percentage);

  return (
    <div className="games-created-card">
      <h3 className="card-title">Games Created (Designer vs Legacy)</h3>

      {/* Time Window Tabs */}
      <div className="time-window-tabs">
        {DAYS_OPTIONS.map((days) => (
          <button
            key={days}
            className={`tab ${activeTab === days ? 'active' : ''}`}
            onClick={() => handleTabClick(days)}
            aria-selected={activeTab === days}
          >
            {DAYS_LABELS[days]}
          </button>
        ))}
      </div>

      {/* Stats Display */}
      <div className="stats-display">
        <div className="stat-row">
          <div className="stat-label">Designer:</div>
          <div className="stat-value" style={{ color: designerColor }}>
            {stats.designer} games
          </div>
          <div className="stat-percentage">
            ({stats.designer_percentage}%)
          </div>
        </div>

        <div className="stat-row">
          <div className="stat-label">Legacy:</div>
          <div className="stat-value" style={{ color: '#6c757d' }}>
            {stats.legacy} games
          </div>
          <div className="stat-percentage">
            ({100 - stats.designer_percentage}%)
          </div>
        </div>
      </div>

      {/* Expand/Collapse League Breakdown */}
      <button
        className="expand-button"
        onClick={() => setExpandedLeague(!expandedLeague)}
        aria-expanded={expandedLeague}
      >
        <span className="chevron" style={{ transform: expandedLeague ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
        {expandedLeague ? 'Hide' : 'View'} League Breakdown
      </button>

      {/* League Breakdown (Expandable) */}
      {expandedLeague && (
        <div className="league-breakdown-container">
          <LeagueAdoptionBreakdown
            leagueData={data.by_league[activeTab]}
            timeWindowDays={activeTab}
          />
        </div>
      )}
    </div>
  );
};
