/**
 * Tests for components/AdoptionMetrics.tsx
 *
 * Coverage targets:
 * - calculateMetrics function with various event combinations
 * - Designer opens count
 * - Publish rate calculations
 * - Template adoption rate calculations
 * - Edge cases (empty events, zero opens, etc)
 */

import { describe, it, expect } from 'vitest';
import { calculateMetrics, AdoptionMetrics } from '../components/AdoptionMetrics';
import { JourneyEvent } from '../types';
import React from 'react';
import { render } from '@testing-library/react';

describe('calculateMetrics', () => {
  describe('Designer Opens Calculation', () => {
    it('should count unique gameday_opened events', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
      ];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(3);
    });

    it('should return 0 when no opens exist', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_created', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-02' },
      ];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(0);
    });

    it('should handle empty events array', () => {
      const events: JourneyEvent[] = [];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(0);
    });
  });

  describe('Publish Rate Calculation', () => {
    it('should calculate publish rate as percentage of opens', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-04' },
        { id: 5, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-05' },
        { id: 6, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-06' },
      ];

      const result = calculateMetrics(events);

      // 2 published / 4 opens = 50%
      expect(result.publishRate).toBe(50);
    });

    it('should calculate 100% publish rate when all opens publish', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-04' },
      ];

      const result = calculateMetrics(events);

      expect(result.publishRate).toBe(100);
    });

    it('should return 0% when no publishes occur', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
      ];

      const result = calculateMetrics(events);

      expect(result.publishRate).toBe(0);
    });

    it('should return 0% when there are no opens', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-01' },
      ];

      const result = calculateMetrics(events);

      expect(result.publishRate).toBe(0);
    });

    it('should handle fractional publish rates', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-04' },
      ];

      const result = calculateMetrics(events);

      // 1 published / 3 opens = 33.33%
      expect(result.publishRate).toBeCloseTo(33.33, 1);
    });
  });

  describe('Template Adoption Rate Calculation', () => {
    it('should calculate template adoption as percentage of opens', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-04' },
        { id: 5, event_name: 'template_used', metadata: {}, created_at: '2024-01-05' },
        { id: 6, event_name: 'template_used', metadata: {}, created_at: '2024-01-06' },
      ];

      const result = calculateMetrics(events);

      // 2 template used / 4 opens = 50%
      expect(result.templateAdoptionRate).toBe(50);
    });

    it('should calculate 100% adoption when all opens use templates', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'template_used', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'template_used', metadata: {}, created_at: '2024-01-04' },
      ];

      const result = calculateMetrics(events);

      expect(result.templateAdoptionRate).toBe(100);
    });

    it('should return 0% when no templates are used', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
      ];

      const result = calculateMetrics(events);

      expect(result.templateAdoptionRate).toBe(0);
    });

    it('should return 0% when there are no opens', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'template_used', metadata: {}, created_at: '2024-01-01' },
      ];

      const result = calculateMetrics(events);

      expect(result.templateAdoptionRate).toBe(0);
    });

    it('should handle fractional adoption rates', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'template_used', metadata: {}, created_at: '2024-01-04' },
      ];

      const result = calculateMetrics(events);

      // 1 template / 3 opens = 33.33%
      expect(result.templateAdoptionRate).toBeCloseTo(33.33, 1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty events array', () => {
      const events: JourneyEvent[] = [];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(0);
      expect(result.publishRate).toBe(0);
      expect(result.templateAdoptionRate).toBe(0);
    });

    it('should handle mixed event types', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_created', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'random_event', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_edited', metadata: {}, created_at: '2024-01-04' },
        { id: 5, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-05' },
        { id: 6, event_name: 'template_used', metadata: {}, created_at: '2024-01-06' },
      ];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(1);
      expect(result.publishRate).toBe(100);
      expect(result.templateAdoptionRate).toBe(100);
    });

    it('should handle more publishes than opens (e.g., multiple publishes per session)', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-03' },
      ];

      const result = calculateMetrics(events);

      // 2 published / 1 open = 200%
      expect(result.publishRate).toBe(200);
    });

    it('should handle only gameday_opened events', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
      ];

      const result = calculateMetrics(events);

      expect(result.designerOpens).toBe(2);
      expect(result.publishRate).toBe(0);
      expect(result.templateAdoptionRate).toBe(0);
    });
  });

  describe('Combined Scenarios', () => {
    it('should calculate all metrics correctly in realistic scenario', () => {
      const events: JourneyEvent[] = [
        { id: 1, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-01' },
        { id: 2, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-02' },
        { id: 3, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-03' },
        { id: 4, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-04' },
        { id: 5, event_name: 'gameday_opened', metadata: {}, created_at: '2024-01-05' },
        { id: 6, event_name: 'gameday_created', metadata: {}, created_at: '2024-01-06' },
        { id: 7, event_name: 'gameday_edited', metadata: {}, created_at: '2024-01-07' },
        { id: 8, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-08' },
        { id: 9, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-09' },
        { id: 10, event_name: 'gameday_published', metadata: {}, created_at: '2024-01-10' },
        { id: 11, event_name: 'template_used', metadata: {}, created_at: '2024-01-11' },
        { id: 12, event_name: 'template_used', metadata: {}, created_at: '2024-01-12' },
      ];

      const result = calculateMetrics(events);

      // 5 opens
      expect(result.designerOpens).toBe(5);
      // 3 published / 5 opens = 60%
      expect(result.publishRate).toBe(60);
      // 2 templates / 5 opens = 40%
      expect(result.templateAdoptionRate).toBe(40);
    });
  });
});

describe('AdoptionMetrics Component', () => {
  const mockAdoptionData = {
    gameday: { opens: 10, published: 5, templates: 2 },
    passcheck: { opens: 20, completed: 15 },
    scorecard: { opens: 30, matches: 25 },
  };

  it('should render adoption metrics component with all features', () => {
    const { container } = render(React.createElement(AdoptionMetrics, { adoptionData: mockAdoptionData }));

    expect(container.querySelector('.adoption-metrics')).toBeTruthy();
    expect(container.querySelector('.metrics-title')).toBeTruthy();
    
    const text = container.textContent || '';
    expect(text).toContain('Gameday Designer');
    expect(text).toContain('Passcheck');
    expect(text).toContain('Scorecard');
  });

  it('should render correct number of metric cards', () => {
    const { container } = render(React.createElement(AdoptionMetrics, { adoptionData: mockAdoptionData }));

    // Gameday (4) + Passcheck (3) + Scorecard (2) = 9 cards
    const cards = container.querySelectorAll('.metric-card');
    expect(cards.length).toBe(9);
  });

  it('should display correct values and labels', () => {
    const { container } = render(React.createElement(AdoptionMetrics, { adoptionData: mockAdoptionData }));

    const text = container.textContent || '';
    // Gameday opens
    expect(text).toContain('10');
    // Gameday publish rate: 5/10 = 50%
    expect(text).toContain('50%');
    // Passcheck opens
    expect(text).toContain('20');
    // Scorecard matches
    expect(text).toContain('25');
  });

  it('should render loading state when data is null', () => {
    const { container } = render(React.createElement(AdoptionMetrics, { adoptionData: null }));

    expect(container.querySelector('.adoption-metrics-loading')).toBeTruthy();
    expect(container.textContent).toContain('Loading adoption metrics...');
  });

  it('should handle missing optional metrics', () => {
    const minimalData = {
      gameday: { opens: 10 },
      passcheck: { opens: 0 },
      scorecard: { opens: 5 },
    };
    const { container } = render(React.createElement(AdoptionMetrics, { adoptionData: minimalData }));
    
    expect(container.querySelector('.adoption-metrics')).toBeTruthy();
    const text = container.textContent || '';
    expect(text).toContain('10');
    expect(text).toContain('0%'); // Publish rate with 0 publishes
  });
});
