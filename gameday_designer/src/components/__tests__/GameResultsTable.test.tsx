import { render, screen } from '@testing-library/react';
import { GameResultsTable } from '../GameResultsTable';
import { GameResultsDisplay } from '../../types/designer';
import { describe, it, expect } from 'vitest';

describe('GameResultsTable', () => {
  const mockGames: GameResultsDisplay[] = [{
    id: 1,
    field: 1,
    scheduled: '10:00',
    status: 'PUBLISHED',
    results: [
      { id: 1, team: { id: 1, name: 'Team A' }, fh: null, sh: null, isHome: true },
      { id: 2, team: { id: 2, name: 'Team B' }, fh: null, sh: null, isHome: false }
    ]
  }];

  it('renders table with team names', () => {
    render(<GameResultsTable games={mockGames} onSave={async () => {}} />);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });

  it('renders "TBD" when team is missing', () => {
    const gamesWithMissingTeam: GameResultsDisplay[] = [{
      ...mockGames[0],
      results: [
        { id: 1, team: undefined, fh: null, sh: null, isHome: true },
        { id: 2, team_name: 'Team B', fh: null, sh: null, isHome: false }
      ]
    }];
    render(<GameResultsTable games={gamesWithMissingTeam} onSave={async () => {}} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });
});
