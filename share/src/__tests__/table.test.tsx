import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseWidgetConfig } from '../lib/params';
import type { LeagueTable } from '../lib/types';
import { Table } from '../views/Table';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

const config = (search: string) => parseWidgetConfig(new URLSearchParams(search));

function standings(
  leagueId: number,
  leagueName: string,
  seasonId: number,
  seasonName: string,
  teamId: number,
  teamName: string
): LeagueTable {
  return {
    league: { id: leagueId, slug: leagueName.toLowerCase(), name: leagueName },
    season: { id: seasonId, slug: seasonName, name: seasonName },
    ranking: ['win_points'],
    rows: [
      {
        standing: 'Gruppe 1',
        group: 'Gruppe 1',
        rank: 1,
        team_id: teamId,
        team__description: teamName,
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
}

describe('Table', () => {
  it('renders the standings delivered with the snapshot', () => {
    const snapshot = {
      ...makeSnapshot([makeGameday({ season: 6, games: [makeGame({ id: 11 })] })]),
      standings: [standings(3, 'DFFL', 6, '2026', 159, 'Renegades')],
    };

    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);

    expect(screen.getByText('Renegades')).toBeInTheDocument();
    expect(screen.getByText('DFFL 2026')).toBeInTheDocument();
  });

  it('shows an error banner when no league in scope has a table', () => {
    // A cup-only scope: the snapshot returns no standings for it.
    const snapshot = {
      ...makeSnapshot([makeGameday({ games: [makeGame({ id: 11 })] })]),
      standings: [],
    };

    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);

    expect(screen.getByText('Tabelle nicht verfügbar.')).toBeInTheDocument();
  });

  it('renders one table per league the teams play in', () => {
    const snapshot = {
      ...makeSnapshot([makeGameday({ season: 6, games: [makeGame({ id: 1 })] })]),
      standings: [
        standings(7, 'DFFL', 6, '2026', 159, 'Renegades'),
        standings(12, 'RL', 6, '2026', 200, 'Crocodiles'),
      ],
    };

    render(<Table snapshot={snapshot} config={config('t=159&t=200&view=table')} />);

    expect(screen.getByText('Renegades')).toBeInTheDocument();
    expect(screen.getByText('Crocodiles')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('narrows to an explicit league', () => {
    const snapshot = {
      ...makeSnapshot([makeGameday({ season: 6, games: [makeGame({ id: 1 })] })]),
      standings: [
        standings(7, 'DFFL', 6, '2026', 159, 'Renegades'),
        standings(12, 'RL', 6, '2026', 200, 'Crocodiles'),
      ],
    };

    render(<Table snapshot={snapshot} config={config('t=159&view=table&league=12')} />);

    expect(screen.getByText('Crocodiles')).toBeInTheDocument();
    expect(screen.queryByText('Renegades')).not.toBeInTheDocument();
  });

  it('hides tables of seasons filtered out of the snapshot', () => {
    // The default-season filter drops 2023 gamedays; their table goes too.
    const snapshot = {
      ...makeSnapshot([makeGameday({ season: 6, games: [makeGame({ id: 1 })] })]),
      standings: [
        standings(7, 'DFFL', 3, '2023', 159, 'Old Renegades'),
        standings(7, 'DFFL', 6, '2026', 159, 'Renegades'),
      ],
    };

    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);

    expect(screen.getByText('Renegades')).toBeInTheDocument();
    expect(screen.queryByText('Old Renegades')).not.toBeInTheDocument();
  });
});
