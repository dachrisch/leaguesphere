import React from 'react';
import { GlobalAdoptionResponse } from '../types';
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
    </div>
  );
};

// Deprecated: Keeping for backward compatibility with tests for now
// @ts-ignore - explicitly de-emphasized
export function calculateMetrics(events: any) {
  return {
    designerOpens: 0,
    publishRate: 0,
    templateAdoptionRate: 0,
  };
}
