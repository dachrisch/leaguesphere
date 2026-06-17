import React, { useState, useEffect } from 'react';
import { GlobalAdoptionResponse, JourneyEvent, GameCreationStatsResponse } from '../types';
import { GameCreationStats } from './GameCreationStats';
import { fetchGameCreationStats } from '../utils/api';
import './AdoptionMetrics.css';

/**
 * Helper to calculate percentage rate safely
 */
const calculateRate = (num: number | undefined, den: number): number => {
  if (!num || den === 0) return 0;
  return (num / den) * 100;
};

/**
 * Helper to format rate as percentage string
 */
const formatRate = (rate: number): string => `${Math.round(rate * 10) / 10}%`;

interface AdoptionMetricsProps {
  adoptionData: GlobalAdoptionResponse | null;
}

/**
 * React component to display adoption metrics for all major features
 * Shows adoption stats for Gameday, Passcheck, and Scorecard
 */
export const AdoptionMetrics: React.FC<AdoptionMetricsProps> = ({ adoptionData }) => {
  const [gameCreationStatsData, setGameCreationStatsData] = useState<GameCreationStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGameCreationStats = async () => {
      try {
        setLoading(true);
        const creationStats = await fetchGameCreationStats();
        setGameCreationStatsData(creationStats);
      } catch (err) {
        console.error('Failed to load game creation stats:', err);
      } finally {
        setLoading(false);
      }
    };
    loadGameCreationStats();
  }, []);

  if (!adoptionData) {
    return (
      <div className="adoption-metrics-loading">
        <div className="loading-spinner"></div>
        <p>Loading adoption metrics...</p>
      </div>
    );
  }

  const { gameday, passcheck, scorecard } = adoptionData;

  const features = [
    {
      id: 'gameday',
      title: 'Gameday Designer',
      color: '#0d6efd',
      metrics: [
        {
          key: 'gd-opens',
          value: gameday.opens,
          label: 'Opens',
          description: 'Number of times designer was opened',
        },
        {
          key: 'gd-published',
          value: gameday.published || 0,
          label: 'Published',
          description: 'Gamedays successfully published',
        },
        {
          key: 'gd-rate',
          value: formatRate(calculateRate(gameday.published, gameday.opens)),
          label: 'Publish Rate',
          description: 'Percentage of opens resulting in publish',
        },
        {
          key: 'gd-templates',
          value: gameday.templates || 0,
          label: 'Templates',
          description: 'Pre-defined templates used',
        },
      ],
    },
    {
      id: 'passcheck',
      title: 'Passcheck',
      color: '#198754',
      metrics: [
        {
          key: 'pc-opens',
          value: passcheck.opens,
          label: 'Opens',
          description: 'Number of times passcheck was used',
        },
        {
          key: 'pc-completed',
          value: passcheck.completed || 0,
          label: 'Completed',
          description: 'Roster verifications completed',
        },
        {
          key: 'pc-rate',
          value: formatRate(calculateRate(passcheck.completed, passcheck.opens)),
          label: 'Completion Rate',
          description: 'Percentage of opens completed',
        },
      ],
    },
    {
      id: 'scorecard',
      title: 'Scorecard',
      color: '#fd7e14',
      metrics: [
        {
          key: 'sc-opens',
          value: scorecard.opens,
          label: 'Opens',
          description: 'Number of times scorecard was used',
        },
        {
          key: 'sc-matches',
          value: scorecard.matches || 0,
          label: 'Matches',
          description: 'Total matches scored',
        },
      ],
    },
  ];

  return (
    <div className="adoption-metrics">
      <h2 className="metrics-title">Feature Adoption</h2>
      <div className="features-container">
        {features.map((feature) => (
          <div key={feature.id} className="feature-section">
            <h3 className="feature-title" style={{ color: feature.color }}>
              {feature.title}
            </h3>
            <div className="metrics-grid">
              {feature.metrics.map((metric) => (
                <div
                  key={metric.key}
                  className="metric-card"
                  style={{ borderLeftColor: feature.color }}
                >
                  <div className="metric-value" style={{ color: feature.color }}>
                    {metric.value}
                  </div>
                  <div className="metric-label">{metric.label}</div>
                  <div className="metric-description">{metric.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Game Creation Stats - Designer vs Legacy */}
      {gameCreationStatsData && !loading && (
        <div className="game-creation-stats-section">
          <GameCreationStats
            data={gameCreationStatsData}
            onTabChange={() => {
              // Optional: trigger re-fetch on tab change if needed
            }}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Calculate adoption metrics from journey events
 * @param events - Array of JourneyEvent objects
 * @returns MetricsData object with adoption metrics
 */
export function calculateMetrics(events: JourneyEvent[]) {
  // Count unique gamedays opened (count of gameday_designer_opened events)
  const designerOpens = events.filter(e => e.event_name === 'gameday_designer_opened').length || 0;

  // Count gamedays published
  const publishedCount = events.filter(e => e.event_name === 'gameday_published').length;

  // Calculate publish rate as percentage of opens
  const publishRate = designerOpens > 0 ? (publishedCount / designerOpens) * 100 : 0;

  // Count template usage
  const templateUsedCount = events.filter(e => e.event_name === 'template_used').length;

  // Calculate template adoption as percentage of opens
  const templateAdoptionRate = designerOpens > 0 ? (templateUsedCount / designerOpens) * 100 : 0;

  return {
    designerOpens,
    publishRate,
    templateAdoptionRate,
  };
}
