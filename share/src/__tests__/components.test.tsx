import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LiveCard } from '../components/LiveCard';
import { PoweredBy } from '../components/PoweredBy';
import { StandingsTable } from '../components/StandingsTable';
import type { LeagueTable, LiveGame } from '../lib/types';

describe('PoweredBy', () => {
  it('always renders the LeagueSphere attribution (not optional)', () => {
    render(<PoweredBy />);
    const link = screen.getByRole('link', { name: /powered by LeagueSphere/i });
    expect(link).toHaveAttribute('href', 'https://leaguesphere.app');
  });
});

function rankOf(team: string): string {
  const row = screen.getByText(team).closest('tr');
  return row?.querySelector('td')?.textContent ?? '';
}

describe('StandingsTable', () => {
  const row = (
    teamId: number,
    description: string,
    group: string,
    rank: number
  ): LeagueTable['rows'][number] => ({
    standing: group,
    group,
    rank,
    team_id: teamId,
    team__description: description,
    wins: 1,
    draws: 0,
    losses: 0,
    games_played: 1,
    pf: 21,
    pa: 7,
    diff: 14,
    win_points: 2,
    win_quotient: 0.625,
  });

  const table: LeagueTable = {
    league: { id: 7, slug: 'dffl', name: 'DFFL' },
    season: { id: 6, slug: '2026', name: '2026' },
    ranking: ['league_points'],
    rows: [row(159, 'Renegades', 'Gruppe 1', 1)],
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

  it('shows the rank from the snapshot instead of the group label', () => {
    const single: LeagueTable = {
      ...table,
      rows: [
        row(159, 'Renegades', 'Gruppe 1', 1),
        row(200, 'Sharks', 'Gruppe 1', 2),
      ],
    };
    render(<StandingsTable table={single} highlightTeamIds={[]} />);
    expect(rankOf('Renegades')).toBe('1');
    expect(rankOf('Sharks')).toBe('2');
  });

  it('omits group headers when all rows share one group', () => {
    const single: LeagueTable = {
      ...table,
      rows: [
        row(159, 'Renegades', 'Gruppe 1', 1),
        row(200, 'Sharks', 'Gruppe 1', 2),
      ],
    };
    render(<StandingsTable table={single} highlightTeamIds={[]} />);
    expect(screen.queryByText('Gruppe 1')).not.toBeInTheDocument();
  });

  it('renders a group header when the group changes', () => {
    const multi: LeagueTable = {
      ...table,
      rows: [
        row(159, 'Renegades', 'Gruppe 1', 1),
        row(200, 'Sharks', 'Gruppe 1', 2),
        row(300, 'Wolves', 'Gruppe 2', 1),
      ],
    };
    render(<StandingsTable table={multi} highlightTeamIds={[]} />);
    expect(screen.getByText('Gruppe 1')).toBeInTheDocument();
    expect(screen.getByText('Gruppe 2')).toBeInTheDocument();
    expect(rankOf('Wolves')).toBe('1');
  });

  it('shows the quotient column when the table ranks by it', () => {
    render(
      <StandingsTable
        table={{ ...table, ranking: ['win_quotient', 'direct_wins'] }}
        highlightTeamIds={[]}
      />
    );
    expect(screen.getByText('Quote')).toBeInTheDocument();
    expect(screen.getByText('0,625')).toBeInTheDocument();
  });

  it('hides the quotient column for tables ranked by points', () => {
    render(<StandingsTable table={table} highlightTeamIds={[]} />);
    expect(screen.queryByText('Quote')).not.toBeInTheDocument();
  });

  it('wraps the table so a narrow embed scrolls instead of clipping', () => {
    render(<StandingsTable table={table} highlightTeamIds={[]} />);
    expect(screen.getByRole('table').closest('.table-responsive')).not.toBeNull();
  });
});

describe('LiveCard', () => {
  const game: LiveGame = {
    gameId: 1,
    status: '1. Halbzeit',
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

  it('links the LIVE badge to live_url when one is configured', () => {
    render(<LiveCard game={game} liveUrl="https://renegades.de/live" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://renegades.de/live');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders no link without a live_url', () => {
    render(<LiveCard game={game} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
