import { describe, expect, it, vi } from 'vitest';

import {
  fetchSeasons,
  fetchSnapshot,
  fetchTeams,
  HttpError,
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

  it('adds includes, a year and a date window to the snapshot url', () => {
    expect(
      snapshotUrl([159], {
        include: ['games', 'teams', 'live'],
        year: '2026',
        dateFrom: '2026-05-09',
        dateTo: '2026-05-09',
      })
    ).toBe(
      '/api/snapshot/?team=159&include=games%2Cteams%2Clive&year=2026' +
        '&date_from=2026-05-09&date_to=2026-05-09'
    );
  });
});

describe('fetchers', () => {
  it('requests the snapshot with an Accept header, always revalidating', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ gamedays: [] }));
    await fetchSnapshot([159], fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/snapshot/?team=159&include=games', {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
  });

  it('unwraps the paginated team directory', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ results: [{ id: 1, name: 'A', description: 'A', logo: null }] })
    );
    const teams = await fetchTeams('A', fetcher);
    expect(teams).toEqual([{ id: 1, name: 'A', description: 'A', logo: null }]);
  });

  it('throws on a non-ok response', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: 'nope' }, 404));
    await expect(fetchSnapshot([1], fetcher)).rejects.toThrow(Error);
  });

  it('fetches the season list for the generator', async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ id: 5, name: '2025' }]));
    expect(await fetchSeasons(fetcher)).toEqual([{ id: 5, name: '2025' }]);
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
