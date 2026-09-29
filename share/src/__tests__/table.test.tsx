import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseWidgetConfig } from '../lib/params';
import { Table } from '../views/Table';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

const config = (search: string) => parseWidgetConfig(new URLSearchParams(search));

function stubFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = handlers[url];
    if (body === undefined) {
      return new Response(JSON.stringify({ detail: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Table', () => {
  it('fetches the latest season table by league slug only (no season slug)', async () => {
    const fetcher = stubFetch({
      '/api/leagues/': [{ id: 3, name: 'RL BAWÜ', slug: 'rl-bawu' }],
      '/api/league-table/rl-bawu/': {
        league: { slug: 'rl-bawu', name: 'RL BAWÜ' },
        season: { slug: '2025-2026', name: '2025/2026' },
        standing: [
          {
            standing: 'Gruppe 1',
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
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const snapshot = makeSnapshot([
      makeGameday({
        league_display: 'RL BAWÜ',
        season_display: '2025/2026',
        games: [makeGame({ id: 11 })],
      }),
    ]);

    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);

    await waitFor(() =>
      expect(screen.getByText('Renegades')).toBeInTheDocument()
    );
    expect(screen.getByText('RL BAWÜ 2025/2026')).toBeInTheDocument();
    const calledUrls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain('/api/league-table/rl-bawu/');
    expect(calledUrls.some((url) => url.includes('2025'))).toBe(false);
  });

  it('shows an error banner when the table is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/api/leagues/': [{ id: 3, name: 'RL BAWÜ', slug: 'rl-bawu' }],
      })
    );
    const snapshot = makeSnapshot([
      makeGameday({
        league_display: 'RL BAWÜ',
        games: [makeGame({ id: 11 })],
      }),
    ]);
    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);
    await waitFor(() =>
      expect(screen.getByText('Tabelle nicht verfügbar.')).toBeInTheDocument()
    );
  });

  it('uses the selected season slug when a season is configured', async () => {
    const fetcher = stubFetch({
      '/api/leagues/': [{ id: 3, name: 'RL BAWÜ', slug: 'rl-bawu' }],
      '/api/seasons/': [{ id: 5, name: '2025/2026' }],
      '/api/league-table/rl-bawu/2025-2026/': {
        league: { slug: 'rl-bawu', name: 'RL BAWÜ' },
        season: { slug: '2025-2026', name: '2025/2026' },
        standing: [
          {
            standing: 'Gruppe 1',
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
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const snapshot = makeSnapshot([
      makeGameday({
        league_display: 'RL BAWÜ',
        games: [makeGame({ id: 11 })],
      }),
    ]);
    render(
      <Table
        snapshot={snapshot}
        config={config('t=159&view=table&season=5')}
        seasonId={5}
      />
    );
    await waitFor(() =>
      expect(screen.getByText('Renegades')).toBeInTheDocument()
    );
    const calledUrls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain('/api/league-table/rl-bawu/2025-2026/');
  });

  it('falls back to the league when a cup candidate returns no table', async () => {
    const fetcher = stubFetch({
      '/api/leagues/': [
        { id: 57, name: 'Bayernpokal', slug: 'bayernpokal' },
        { id: 7, name: 'DFFL', slug: 'dffl' },
      ],
      '/api/league-table/dffl/': {
        league: { slug: 'dffl', name: 'DFFL' },
        season: { slug: '2026', name: '2026' },
        standing: [
          {
            standing: 'Gruppe 1',
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
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        league: 57,
        league_display: 'Bayernpokal',
        games: [makeGame({ id: 1 }), makeGame({ id: 2 }), makeGame({ id: 3 })],
      }),
      makeGameday({
        id: 2,
        league: 7,
        league_display: 'DFFL',
        games: [makeGame({ id: 4 })],
      }),
    ]);
    render(<Table snapshot={snapshot} config={config('t=159&view=table')} />);

    await waitFor(() =>
      expect(screen.getByText('Renegades')).toBeInTheDocument()
    );
    expect(screen.getByText('DFFL 2026')).toBeInTheDocument();
    const calledUrls = fetcher.mock.calls.map((call) => String(call[0]));
    // The larger cup is tried first, then the league succeeds.
    expect(calledUrls).toContain('/api/league-table/bayernpokal/');
    expect(calledUrls).toContain('/api/league-table/dffl/');
  });

  it('uses an explicit league without trying other candidates', async () => {
    const fetcher = stubFetch({
      '/api/leagues/': [
        { id: 57, name: 'Bayernpokal', slug: 'bayernpokal' },
        { id: 7, name: 'DFFL', slug: 'dffl' },
      ],
      '/api/league-table/dffl/': {
        league: { slug: 'dffl', name: 'DFFL' },
        season: { slug: '2026', name: '2026' },
        standing: [
          {
            standing: 'Gruppe 1',
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
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        league: 57,
        league_display: 'Bayernpokal',
        games: [makeGame({ id: 1 }), makeGame({ id: 2 }), makeGame({ id: 3 })],
      }),
      makeGameday({
        id: 2,
        league: 7,
        league_display: 'DFFL',
        games: [makeGame({ id: 4 })],
      }),
    ]);
    render(
      <Table snapshot={snapshot} config={config('t=159&view=table&league=7')} />
    );

    await waitFor(() =>
      expect(screen.getByText('Renegades')).toBeInTheDocument()
    );
    const calledUrls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain('/api/league-table/dffl/');
    expect(calledUrls.some((url) => url.includes('bayernpokal'))).toBe(false);
  });

  it('renders a standings table for each league the teams play in', async () => {
    const fetcher = stubFetch({
      '/api/leagues/': [
        { id: 7, name: 'DFFL', slug: 'dffl' },
        { id: 12, name: 'RL BAWÜ', slug: 'rl-bawu' },
      ],
      '/api/league-table/dffl/': {
        league: { slug: 'dffl', name: 'DFFL' },
        season: { slug: '2026', name: '2026' },
        standing: [
          {
            standing: 'Gruppe 1',
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
      },
      '/api/league-table/rl-bawu/': {
        league: { slug: 'rl-bawu', name: 'RL BAWÜ' },
        season: { slug: '2025-2026', name: '2025/2026' },
        standing: [
          {
            standing: 'Gruppe 1',
            team_id: 200,
            team__description: 'Crocodiles',
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
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        league: 7,
        league_display: 'DFFL',
        games: [makeGame({ id: 1 })],
      }),
      makeGameday({
        id: 2,
        league: 12,
        league_display: 'RL BAWÜ',
        games: [makeGame({ id: 2 })],
      }),
    ]);
    render(<Table snapshot={snapshot} config={config('t=159&t=200&view=table')} />);

    await waitFor(() =>
      expect(screen.getByText('Renegades')).toBeInTheDocument()
    );
    expect(await screen.findByText('Crocodiles')).toBeInTheDocument();
    expect(screen.getByText('DFFL 2026')).toBeInTheDocument();
    expect(screen.getByText('RL BAWÜ 2025/2026')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });
});
