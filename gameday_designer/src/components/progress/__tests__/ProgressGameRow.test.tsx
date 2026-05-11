import React from 'react';
import { render, screen } from '@testing-library/react';
import ProgressGameRow from '../cards/ProgressGameRow';
import type { GamedaySummary } from '../../../types/progress';

describe('ProgressGameRow', () => {
  const mockGameday: GamedaySummary = {
    gd: {
      id: 1,
      name: 'Spieltag 1',
      date: '2026-05-10',
      start: '15:00',
      status: 'Geplant',
      league: 1,
      league_display: 'Liga A',
      season: 1,
      season_display: '2026',
      games: [
        {
          id: 1,
          scheduled: '15:00',
          status: 'Geplant',
          gameStarted: null,
          gameFinished: null,
          field: 1,
          stage: 'Hauptrunde',
          standing: 'A',
          result: undefined,
        },
      ],
    },
    s: {
      status: 'soon',
      played: 0,
      live: 0,
      upcoming: 1,
      firstStart: new Date('2026-05-10T15:00:00'),
      lastEnd: new Date('2026-05-10T16:30:00'),
    },
  };

  test('renders gameday name', () => {
    render(<ProgressGameRow gameday={mockGameday} isLast={false} />);
    expect(screen.getByText('Spieltag 1')).toBeInTheDocument();
  });

  test('renders gameday date', () => {
    render(<ProgressGameRow gameday={mockGameday} isLast={false} />);
    expect(screen.getByText(/10|05/)).toBeInTheDocument();
  });

  test('renders gameday start time', () => {
    render(<ProgressGameRow gameday={mockGameday} isLast={false} />);
    expect(screen.getByText(/15:00|3:00/)).toBeInTheDocument();
  });

  test('shows countdown when within 90 minutes', () => {
    const soonGameday: GamedaySummary = {
      ...mockGameday,
      s: {
        ...mockGameday.s,
        firstStart: new Date(new Date().getTime() + 45 * 60000), // 45 min from now
      },
    };

    render(<ProgressGameRow gameday={soonGameday} isLast={false} />);
    expect(screen.getByText(/in\s+45|in\s+44|in\s+46/)).toBeInTheDocument();
  });

  test('does not show countdown when more than 90 minutes away', () => {
    const laterGameday: GamedaySummary = {
      ...mockGameday,
      s: {
        ...mockGameday.s,
        firstStart: new Date(new Date().getTime() + 120 * 60000), // 120 min from now
      },
    };

    render(<ProgressGameRow gameday={laterGameday} isLast={false} />);
    const countdownElements = screen.queryAllByText(/in\s+\d+/);
    expect(countdownElements.length).toBe(0);
  });

  test('renders game row container', () => {
    const { container } = render(<ProgressGameRow gameday={mockGameday} isLast={false} />);
    const row = container.querySelector('div');
    expect(row).toBeInTheDocument();
  });

  test('renders different styles when isLast is true', () => {
    const { container: container1 } = render(<ProgressGameRow gameday={mockGameday} isLast={false} />);
    const { container: container2 } = render(<ProgressGameRow gameday={mockGameday} isLast={true} />);

    const row1 = container1.querySelector('div');
    const row2 = container2.querySelector('div');

    expect(row1?.className).not.toBe(row2?.className);
  });
});
