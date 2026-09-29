import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../widget/App';

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const FINAL_SNAPSHOT = {
  generated_at: 'x',
  etag: 'e',
  gamedays: [
    {
      id: 1,
      name: 'Spieltag',
      season: 1,
      season_display: '2026',
      league: 1,
      league_display: 'Liga',
      date: '2026-05-09',
      start: '10:00',
      format: 'CUSTOM',
      author: 1,
      address: 'Nürnberg',
      status: 'PUBLISHED',
      has_designer_state: false,
      games: [
        {
          id: 1,
          gameday: 1,
          scheduled: '10:00',
          field: 1,
          officials: null,
          stage: '',
          standing: '',
          status: 'beendet',
          results: [
            { id: 1, team_id: 159, team_name: 'Renegades', fh: 1, sh: 0, pa: 0, isHome: true },
            { id: 2, team_id: 999, team_name: 'Rival', fh: 0, sh: 0, pa: 0, isHome: false },
          ],
          halftime_score: { home: 0, away: 0 },
          final_score: { home: 1, away: 0 },
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

function stubApi(seasons: Array<{ id: number; name: string }>) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith('/api/seasons/')
      ? seasons
      : { gamedays: [], generated_at: 'x', etag: 'e' };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('widget App season resolution', () => {
  it('resolves ?year= to the season id in the snapshot request', async () => {
    const fetcher = stubApi([{ id: 6, name: '2026' }]);
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026');
    render(<App />);
    await waitFor(() =>
      expect(
        fetcher.mock.calls.map((call) => String(call[0])).some((url) =>
          url.includes('/api/snapshot/') && url.includes('season=6')
        )
      ).toBe(true)
    );
  });

  it('prefers an explicit ?season= over ?year=', async () => {
    const fetcher = stubApi([{ id: 6, name: '2026' }]);
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026&season=3');
    render(<App />);
    await waitFor(() =>
      expect(
        fetcher.mock.calls.map((call) => String(call[0])).some((url) =>
          url.includes('/api/snapshot/') && url.includes('season=3')
        )
      ).toBe(true)
    );
  });

  it('renders only the newest season that contains the team by default', async () => {
    const game = (id: number, opponent: string, opponentId: number) => ({
      id,
      gameday: id,
      scheduled: '10:00',
      field: 1,
      officials: null,
      stage: '',
      standing: '',
      status: 'beendet',
      results: [
        { id: id * 10, team_id: 159, team_name: 'Renegades', fh: 1, sh: 0, pa: 0, isHome: true },
        { id: id * 10 + 1, team_id: opponentId, team_name: opponent, fh: 0, sh: 0, pa: 0, isHome: false },
      ],
      halftime_score: { home: 0, away: 0 },
      final_score: { home: 1, away: 0 },
    });
    const gameday = (
      id: number,
      seasonDisplay: string,
      date: string,
      opponent: string
    ) => ({
      id,
      name: `Spieltag ${id}`,
      season: id,
      season_display: seasonDisplay,
      league: 1,
      league_display: 'Liga',
      date,
      start: '10:00',
      format: 'CUSTOM',
      author: 1,
      address: 'Nürnberg',
      status: 'PUBLISHED',
      has_designer_state: false,
      games: [game(id, opponent, 900 + id)],
    });
    const snapshot = {
      generated_at: 'x',
      etag: 'e',
      gamedays: [
        gameday(1, '2023', '2023-05-13', 'OldRival'),
        gameday(2, '2026', '2026-05-09', 'NewRival'),
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.startsWith('/api/seasons/') ? [] : snapshot;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    window.history.pushState({}, '', '/share/widget/?t=159');
    render(<App />);
    expect(await screen.findByText('NewRival')).toBeInTheDocument();
    expect(screen.queryByText('OldRival')).not.toBeInTheDocument();
  });

  it('does not fetch the snapshot before the year resolves', async () => {
    let resolveSeasons: (value: Array<{ id: number; name: string }>) => void =
      () => {};
    const seasonsPending = new Promise<Array<{ id: number; name: string }>>(
      (resolve) => {
        resolveSeasons = resolve;
      }
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/seasons/')) {
        return json(await seasonsPending);
      }
      return json({ gamedays: [], generated_at: 'x', etag: 'e' });
    });
    vi.stubGlobal('fetch', fetcher);
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026');
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    const snapshotCalls = () =>
      fetcher.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.startsWith('/api/snapshot/'));
    expect(snapshotCalls()).toHaveLength(0);

    resolveSeasons([{ id: 6, name: '2026' }]);
    await waitFor(() => expect(snapshotCalls().length).toBeGreaterThan(0));
    expect(snapshotCalls()[0]).toContain('season=6');
  });

  it('retries a single 429 and then renders the snapshot', async () => {
    let snapshotCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/seasons/')) {
          return json([]);
        }
        snapshotCalls += 1;
        if (snapshotCalls === 1) {
          return json({}, 429, { 'Retry-After': '0' });
        }
        return json(FINAL_SNAPSHOT);
      })
    );
    window.history.pushState({}, '', '/share/widget/?t=159');
    render(<App />);
    expect(await screen.findByText('Rival')).toBeInTheDocument();
    expect(snapshotCalls).toBe(2);
  });

  it('shows the error after a second 429 instead of retrying forever', async () => {
    let snapshotCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/seasons/')) {
          return json([]);
        }
        snapshotCalls += 1;
        return json({}, 429, { 'Retry-After': '0' });
      })
    );
    window.history.pushState({}, '', '/share/widget/?t=159');
    render(<App />);
    expect(
      await screen.findByText('Daten konnten nicht geladen werden.')
    ).toBeInTheDocument();
    expect(snapshotCalls).toBe(2);
  });
});
