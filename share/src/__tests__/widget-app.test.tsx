import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { todayIso } from '../lib/schedule';
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

function stubSnapshot(snapshot: unknown = { gamedays: [], generated_at: 'x', etag: 'e' }) {
  const fetcher = vi.fn(async () => json(snapshot));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const requestedUrls = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.map((call) => String(call[0]));

describe('widget App data source', () => {
  it('passes ?year= straight to the snapshot (no season lookup)', async () => {
    const fetcher = stubSnapshot();
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026');
    render(<App />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const [url] = requestedUrls(fetcher);
    expect(url).toContain('/api/snapshot/?team=159');
    expect(url).toContain('year=2026');
    expect(url).toContain('include=games%2Cteams');
  });

  it('prefers an explicit ?season= over ?year=', async () => {
    const fetcher = stubSnapshot();
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026&season=3');
    render(<App />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const [url] = requestedUrls(fetcher);
    expect(url).toContain('season=3');
    expect(url).not.toContain('year=');
  });

  it.each(['spielplan', 'table', 'live'])(
    'reads only the public snapshot in the %s view',
    async (view) => {
      const fetcher = stubSnapshot(FINAL_SNAPSHOT);
      window.history.pushState({}, '', `/share/widget/?t=159&view=${view}`);
      render(<App />);
      await waitFor(() => expect(fetcher).toHaveBeenCalled());
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        requestedUrls(fetcher).every((url) => url.startsWith('/api/snapshot/'))
      ).toBe(true);
    }
  );

  it('asks for standings in the table view and renders them', async () => {
    const fetcher = stubSnapshot({
      ...FINAL_SNAPSHOT,
      standings: [
        {
          league: { id: 1, slug: 'liga', name: 'Liga' },
          season: { id: 1, slug: '2026', name: '2026' },
          ranking: ['win_points'],
          rows: [
            {
              standing: 'Gruppe 1',
              group: 'Gruppe 1',
              rank: 1,
              team_id: 159,
              team__description: 'Nürnberg Renegades',
              wins: 1,
              draws: 0,
              losses: 0,
              games_played: 1,
              pf: 1,
              pa: 0,
              diff: 1,
              win_points: 2,
              win_quotient: 1,
            },
          ],
        },
      ],
    });
    window.history.pushState({}, '', '/share/widget/?t=159&view=table');
    render(<App />);
    expect(await screen.findByText('Nürnberg Renegades')).toBeInTheDocument();
    expect(screen.getByText('Liga 2026')).toBeInTheDocument();
    expect(requestedUrls(fetcher)[0]).toContain('include=games%2Cteams%2Cstandings');
  });

  it('shows full team names from the snapshot teams map', async () => {
    stubSnapshot({
      ...FINAL_SNAPSHOT,
      teams: {
        '159': { name: 'Renegades', description: 'Nürnberg Renegades', logo: null },
        '999': { name: 'Rival', description: 'Rival Club Munich', logo: null },
      },
    });
    window.history.pushState({}, '', '/share/widget/?t=159');
    render(<App />);
    expect(await screen.findByText('Rival Club Munich')).toBeInTheDocument();
    expect(screen.getByText('Nürnberg Renegades')).toBeInTheDocument();
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
    stubSnapshot(snapshot);
    window.history.pushState({}, '', '/share/widget/?t=159');
    render(<App />);
    expect(await screen.findByText('NewRival')).toBeInTheDocument();
    expect(screen.queryByText('OldRival')).not.toBeInTheDocument();
  });

  it('retries a single 429 and then renders the snapshot', async () => {
    let snapshotCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
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
      vi.fn(async () => {
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

describe('widget App live view', () => {
  const liveSnapshot = () => ({
    generated_at: 'x',
    etag: 'e',
    scope: { team: [159] },
    gamedays: [
      {
        ...FINAL_SNAPSHOT.gamedays[0],
        date: todayIso(),
        games: [
          {
            ...FINAL_SNAPSHOT.gamedays[0].games[0],
            status: '1. Halbzeit',
            live: {
              status: '1. Halbzeit',
              time: '10:05',
              home: { name: 'Nürnberg Renegades', score: 7, isInPossession: true },
              away: { name: 'Rival Club', score: 0, isInPossession: false },
              ticks: [{ text: 'Touchdown: #12', team: 'home', time: '10:04' }],
            },
          },
        ],
      },
    ],
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests today's live blocks and renders the live card", async () => {
    const fetcher = stubSnapshot(liveSnapshot());
    window.history.pushState({}, '', '/share/widget/?t=159&view=live');
    render(<App />);
    expect(await screen.findByText('Touchdown: #12')).toBeInTheDocument();
    expect(screen.getByText('7 : 0')).toBeInTheDocument();
    const [url] = requestedUrls(fetcher);
    expect(url).toContain('include=games%2Cteams%2Clive');
    expect(url).toContain(`date_from=${todayIso()}`);
    expect(url).toContain(`date_to=${todayIso()}`);
  });

  it('says so when nothing is live today', async () => {
    stubSnapshot({ generated_at: 'x', etag: 'e', scope: { team: [159] }, gamedays: [] });
    window.history.pushState({}, '', '/share/widget/?t=159&view=live');
    render(<App />);
    expect(await screen.findByText('Kein Live-Spiel gerade.')).toBeInTheDocument();
  });

  it('re-polls the snapshot while a watched game is live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = stubSnapshot(liveSnapshot());
    window.history.pushState({}, '', '/share/widget/?t=159&view=live');
    render(<App />);
    expect(await screen.findByText('Touchdown: #12')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops polling when no watched game is open today', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = stubSnapshot({
      generated_at: 'x',
      etag: 'e',
      scope: { team: [159] },
      gamedays: [],
    });
    window.history.pushState({}, '', '/share/widget/?t=159&view=live');
    render(<App />);
    expect(await screen.findByText('Kein Live-Spiel gerade.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
