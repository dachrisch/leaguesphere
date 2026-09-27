import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseWidgetConfig } from '../lib/params';
import { Spielplan } from '../views/Spielplan';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

const config = (search: string) => parseWidgetConfig(new URLSearchParams(search));

describe('Spielplan', () => {
  it('renders final and upcoming games for the configured team', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        date: '2026-05-01',
        games: [
          makeGame({
            id: 11,
            status: 'beendet',
            results: [
              { id: 1, team_id: 159, team_name: 'Renegades', fh: 2, sh: 1, pa: 0, isHome: true },
              { id: 2, team_id: 200, team_name: 'Sharks', fh: 1, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
      makeGameday({
        id: 2,
        date: '2026-06-01',
        games: [makeGame({ id: 22, scheduled: '14:00', status: 'Geplant' })],
      }),
    ]);

    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);

    expect(screen.getByText('Renegades')).toBeInTheDocument();
    expect(screen.getByText('3 : 1')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('powered by LeagueSphere')).toBeInTheDocument();
  });

  it('only shows the configured teams', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [
          makeGame({
            id: 1,
            status: 'beendet',
            results: [
              { id: 1, team_id: 500, team_name: 'Alpha', fh: 1, sh: 0, pa: 0, isHome: true },
              { id: 2, team_id: 501, team_name: 'Beta', fh: 0, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
    ]);
    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('asks for a team when none is configured', () => {
    render(<Spielplan snapshot={makeSnapshot([])} config={config('')} />);
    expect(screen.getByText('Kein Team konfiguriert.')).toBeInTheDocument();
  });

  it('hides branding when powered=0', () => {
    render(<Spielplan snapshot={makeSnapshot([])} config={config('t=159&powered=0')} />);
    expect(screen.queryByText('powered by LeagueSphere')).not.toBeInTheDocument();
  });
});
