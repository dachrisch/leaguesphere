import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GamedayCard from '../GamedayCard';
import { GamedayWithStats } from '../../../types/progressTypes';

// Mock translation
vi.mock('../../../i18n/useTypedTranslation', () => ({
  useTypedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'ui:gameProgress.card.upcomingBadge') return 'UPCOMING';
      if (key === 'ui:gameProgress.card.finishedBadge') return 'FINISHED';
      if (key === 'ui:gameProgress.card.minutesUntil') return `${params?.minutes} min until start`;
      if (key === 'ui:gameProgress.card.played') return `Played ${params?.played}/${params?.total}`;
      return key;
    },
  }),
}));

describe('GamedayCard', () => {
  const baseGameday: Partial<GamedayWithStats> = {
    id: 1,
    name: 'Test Gameday',
    date: '2026-05-24',
    start: '10:00:00',
    league_display: 'Test League',
    games: [],
    stats: { total: 10, played: 0, live: 0, pending: 10, percentComplete: 0 }
  };

  it('should show UPCOMING badge when today gameday has not started', () => {
    const gameday = {
      ...baseGameday,
      minutesUntilStart: 60,
    };
    render(<GamedayCard gameday={gameday as GamedayWithStats} isLive={true} />);
    
    expect(screen.getByText(/UPCOMING/)).toBeDefined();
    expect(screen.getByText('60 min until start')).toBeDefined();
    // Progress bar should be hidden
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('should show LIVE badge when today gameday has live games', () => {
    const gameday = {
      ...baseGameday,
      stats: { total: 10, played: 2, live: 1, pending: 7, percentComplete: 20 }
    };
    render(<GamedayCard gameday={gameday as GamedayWithStats} isLive={true} />);
    
    expect(screen.getByText(/LIVE/)).toBeDefined();
    expect(screen.getByText('Played 2/10')).toBeDefined();
    expect(screen.getByText('20%')).toBeDefined();
  });

  it('should show FINISHED badge when today gameday is complete', () => {
    const gameday = {
      ...baseGameday,
      stats: { total: 10, played: 10, live: 0, pending: 0, percentComplete: 100 }
    };
    render(<GamedayCard gameday={gameday as GamedayWithStats} isLive={true} />);
    
    expect(screen.getByText(/FINISHED/)).toBeDefined();
    expect(screen.getByText('Played 10/10')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('should show stale label if gameday is stale', () => {
    const gameday = {
      ...baseGameday,
      isStale: true,
    };
    render(<GamedayCard gameday={gameday as GamedayWithStats} isLive={true} />);
    
    expect(screen.getByText('ui:gameProgress.card.stale')).toBeDefined();
    // Minutes until start should be hidden if stale
    expect(screen.queryByText(/min until start/)).toBeNull();
  });
});
