import { describe, expect, it, vi } from 'vitest';

import {
  fetchLeagues,
  fetchLeagueTable,
  fetchLiveticker,
  fetchSeasons,
  fetchSnapshot,
  fetchTeams,
  HttpError,
  leagueTableUrl,
  retryDelayMs,
  snapshotUrl,
  teamsUrl,
} from '../lib/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('url builders', () => {
  it('builds a team-filtered, games-only snapshot url', () => {
    expect(snapshotUrl([159, 287])).toBe(
      '/api/snapshot/?team=159&team=287&include=games'
    );
  });

  it('adds optional season and league filters to the snapshot url', () => {
    expect(snapshotUrl([159], { season: 5, league: 8 })).toBe(
      '/api/snapshot/?team=159&include=games&season=5&league=8'
    );
  });

  it('builds a team search url with a bounded page size', () => {
    expect(teamsUrl('Renegades')).toBe('/api/teams/?search=Renegades&page_size=50');
  });

  it('encodes league in the table url and omits an optional season', () => {
    expect(leagueTableUrl('dffl', '2026')).toBe('/api/league-table/dffl/2026/');
    expect(leagueTableUrl('dffl')).toBe('/api/league-table/dffl/');
  });
});

describe('fetchers', () => {
  it('requests the snapshot with an Accept header', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ gamedays: [] }));
    await fetchSnapshot([159], fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/snapshot/?team=159&include=games', {
      headers: { Accept: 'application/json' },
    });
  });

  it('unwraps the paginated team directory', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ results: [{ id: 1, name: 'A', description: 'A', logo: null }] })
    );
    const teams = await fetchTeams('A', fetcher);
    expect(teams).toEqual([{ id: 1, name: 'A', description: 'A', logo: null }]);
  });

  it('fetches the liveticker feed as a list', async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ gameId: 1 }]));
    expect(await fetchLiveticker(fetcher)).toEqual([{ gameId: 1 }]);
  });

  it('fetches the latest league table when no season is given', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ league: { slug: 'dffl', name: 'DFFL' }, season: {}, standing: [] })
    );
    await fetchLeagueTable('dffl', undefined, fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/league-table/dffl/', {
      headers: { Accept: 'application/json' },
    });
  });

  it('throws on a non-ok response', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: 'nope' }, 404));
    await expect(fetchSnapshot([1], fetcher)).rejects.toThrow(Error);
  });

  it('fetches seasons and leagues as directory lists', async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ id: 5, name: '2025' }]));
    expect(await fetchSeasons(fetcher)).toEqual([{ id: 5, name: '2025' }]);
    const leagueFetcher = vi.fn(async () =>
      jsonResponse([{ id: 8, name: 'DFFL2', slug: 'dffl2' }])
    );
    expect(await fetchLeagues(leagueFetcher)).toEqual([
      { id: 8, name: 'DFFL2', slug: 'dffl2' },
    ]);
  });
});

describe('retryDelayMs', () => {
  it('honours Retry-After but caps it at 30 seconds', () => {
    expect(retryDelayMs(new HttpError(429, 2))).toBe(2000);
    expect(retryDelayMs(new HttpError(429, 45))).toBe(30000);
  });

  it('defaults a missing Retry-After and ignores non-429 errors', () => {
    expect(retryDelayMs(new HttpError(429, null))).toBe(1000);
    expect(retryDelayMs(new HttpError(500, null))).toBeNull();
    expect(retryDelayMs(new Error('boom'))).toBeNull();
  });
});
