import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LiveCard } from '../components/LiveCard';
import { StandingsTable } from '../components/StandingsTable';
import type { LeagueTable, LiveGame } from '../lib/types';

describe('StandingsTable', () => {
  const table: LeagueTable = {
    league: { slug: 'dffl', name: 'DFFL' },
    season: { slug: '2026', name: '2026' },
    standing: [
      {
        standing: 1,
        team_id: 159,
        team__description: 'Renegades',
        wins: 1,
        draws: 0,
        losses: 0,
        games_played: 1,
        pf: 21,
        pa: 7,
        diff: 14,
        win_points: 2,
        win_quotient: 1,
      },
    ],
  };

  it('renders the standing and highlights the configured team', () => {
    render(<StandingsTable table={table} highlightTeamIds={[159]} />);
    const cell = screen.getByText('Renegades');
    expect(cell.closest('tr')).toHaveClass('share-table__row--highlight');
  });

  it('does not highlight other teams', () => {
    render(<StandingsTable table={table} highlightTeamIds={[999]} />);
    expect(screen.getByText('Renegades').closest('tr')).not.toHaveClass(
      'share-table__row--highlight'
    );
  });
});

describe('LiveCard', () => {
  const game: LiveGame = {
    gameId: 1,
    status: '1. Halbzeit',
    standing: '',
    time: '12:00',
    home: { name: 'Renegades', score: 7, isInPossession: false },
    away: { name: 'Sharks', score: 0, isInPossession: false },
    ticks: [{ text: 'Touchdown: #12', team: 'home', time: '12:01' }],
  };

  it('renders the score and latest ticks', () => {
    render(<LiveCard game={game} />);
    expect(screen.getByText('7 : 0')).toBeInTheDocument();
    expect(screen.getByText('Touchdown: #12')).toBeInTheDocument();
    expect(screen.getByText('1. Halbzeit')).toBeInTheDocument();
  });

  it('escapes untrusted names and tick text', () => {
    const unsafe: LiveGame = {
      ...game,
      home: { name: '<img src=x onerror=alert(1)>', score: 0, isInPossession: false },
      ticks: [{ text: '<script>alert(1)</script>', team: null, time: '12:02' }],
    };
    render(<LiveCard game={unsafe} />);
    expect(
      screen.getByText('<img src=x onerror=alert(1)>')
    ).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });
});
