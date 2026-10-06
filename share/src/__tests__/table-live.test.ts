import { describe, expect, it } from 'vitest';

import { activeWatchedGames, liveGames } from '../lib/live';
import {
  filterToLatestSeason,
  leaguesInSnapshot,
  latestSeasonDisplay,
} from '../lib/derived';
import { ranksByQuotient } from '../lib/table';
import type { SnapshotLive } from '../lib/types';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

const TODAY = '2026-05-09';

describe('leaguesInSnapshot', () => {
  it('lists distinct leagues the teams appeared in, sorted by name', () => {
    const snapshot = makeSnapshot([
      makeGameday({ id: 1, league: 57, league_display: 'Bayernpokal' }),
      makeGameday({ id: 2, league: 8, league_display: 'DFFL2' }),
      makeGameday({ id: 3, league: 8, league_display: 'DFFL2' }),
    ]);
    expect(leaguesInSnapshot(snapshot)).toEqual([
      { id: 57, name: 'Bayernpokal' },
      { id: 8, name: 'DFFL2' },
    ]);
  });

  it('returns an empty list when the snapshot has no gamedays', () => {
    expect(leaguesInSnapshot(makeSnapshot([]))).toEqual([]);
  });
});

describe('ranksByQuotient', () => {
  const table = (ranking: string[]) => ({
    league: { id: 1, slug: 'l', name: 'L' },
    season: { id: 1, slug: '2026', name: '2026' },
    ranking,
    rows: [],
  });

  it('is true only when the quotient is the first ranking step', () => {
    expect(ranksByQuotient(table(['win_quotient', 'direct_wins']))).toBe(true);
    expect(ranksByQuotient(table(['win_points', 'win_quotient']))).toBe(false);
    expect(ranksByQuotient(table([]))).toBe(false);
  });
});

describe('activeWatchedGames', () => {
  it('lists non-final games for the watched teams', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        games: [
          makeGame({ id: 11, status: 'Geplant' }),
          makeGame({ id: 12, status: 'beendet' }),
          makeGame({ id: 13, status: 'Gestartet' }),
        ],
      }),
    ]);
    const games = activeWatchedGames(snapshot, [159], TODAY);
    expect(games.map((game) => game.gameId)).toEqual([11, 13]);
    expect(games[0]).toMatchObject({ teamId: 159, isHome: true, opponent: 'Sharks' });
  });

  it('ignores open games that are not scheduled for today', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        date: '2023-05-13',
        games: [makeGame({ id: 11, status: 'Geplant' })],
      }),
    ]);
    expect(activeWatchedGames(snapshot, [159], '2026-09-29')).toEqual([]);
  });

  it('de-duplicates a game watched by two configured teams', () => {
    const snapshot = makeSnapshot([
      makeGameday({ games: [makeGame({ id: 11, status: 'Geplant' })] }),
    ]);
    const games = activeWatchedGames(snapshot, [159, 200], TODAY);
    expect(games.map((game) => game.gameId)).toEqual([11]);
  });
});

describe('activeWatchedGames names', () => {
  it('names the opponent from the snapshot teams map', () => {
    const snapshot = {
      ...makeSnapshot([makeGameday({ games: [makeGame({ id: 11 })] })]),
      teams: { '200': { name: 'Sharks', description: 'Hamburg Sharks', logo: null } },
    };
    expect(activeWatchedGames(snapshot, [159], TODAY)[0].opponent).toBe(
      'Hamburg Sharks'
    );
  });
});

describe('liveGames', () => {
  const live: SnapshotLive = {
    status: '1. Halbzeit',
    time: '10:05',
    home: { name: 'Renegades', score: 7, isInPossession: true },
    away: { name: 'Sharks', score: 0, isInPossession: false },
    ticks: [],
  };

  it("turns today's live blocks of watched games into live cards", () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [
          makeGame({ id: 11, status: '1. Halbzeit', live }),
          makeGame({ id: 12, status: 'Geplant' }),
        ],
      }),
    ]);
    expect(liveGames(snapshot, [159], TODAY)).toEqual([{ gameId: 11, ...live }]);
  });

  it('ignores live blocks of unwatched teams and other days', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [makeGame({ id: 11, status: '1. Halbzeit', live })],
      }),
    ]);
    expect(liveGames(snapshot, [777], TODAY)).toEqual([]);
    expect(liveGames(snapshot, [159], '2026-05-10')).toEqual([]);
  });
});

describe('latest season resolution', () => {
  it('picks the season with the team game on the most recent date', () => {
    const snapshot = makeSnapshot([
      makeGameday({ id: 1, season_display: '2023', date: '2023-05-13', games: [makeGame({ id: 1 })] }),
      makeGameday({ id: 2, season_display: '2026', date: '2026-05-09', games: [makeGame({ id: 2 })] }),
    ]);
    expect(latestSeasonDisplay(snapshot, [159])).toBe('2026');
  });

  it('ignores seasons where the watched team does not play', () => {
    const snapshot = makeSnapshot([
      makeGameday({ id: 1, season_display: '2023', date: '2023-05-13', games: [makeGame({ id: 1 })] }),
      makeGameday({
        id: 2,
        season_display: '2026',
        date: '2026-05-09',
        games: [
          makeGame({
            id: 2,
            results: [
              { id: 3, team_id: 500, team_name: 'A', fh: 0, sh: 0, pa: 0, isHome: true },
              { id: 4, team_id: 501, team_name: 'B', fh: 0, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
    ]);
    expect(latestSeasonDisplay(snapshot, [159])).toBe('2023');
  });

  it('returns null when none of the watched teams has a game', () => {
    expect(latestSeasonDisplay(makeSnapshot([]), [159])).toBeNull();
  });
});

describe('filterToLatestSeason', () => {
  it('keeps only the newest season the watched team appears in', () => {
    const snapshot = makeSnapshot([
      makeGameday({ id: 1, season_display: '2023', date: '2023-05-13', games: [makeGame({ id: 1 })] }),
      makeGameday({ id: 2, season_display: '2026', date: '2026-05-09', games: [makeGame({ id: 2 })] }),
    ]);
    expect(
      filterToLatestSeason(snapshot, [159]).gamedays.map((g) => g.season_display)
    ).toEqual(['2026']);
  });

  it('leaves the snapshot untouched when the team has no games', () => {
    const snapshot = makeSnapshot([makeGameday({ games: [] })]);
    expect(filterToLatestSeason(snapshot, [159])).toBe(snapshot);
  });
});
