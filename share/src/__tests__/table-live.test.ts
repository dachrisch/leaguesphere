import { describe, expect, it } from 'vitest';

import { activeWatchedGames } from '../lib/live';
import { leaguesInSnapshot } from '../lib/derived';
import { pickLeagueSeason, resolveSeasonId } from '../lib/table';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

describe('resolveSeasonId', () => {
  const seasons = [
    { id: 6, name: '2026' },
    { id: 4, name: '2025/2026' },
    { id: 3, name: '2021' },
  ];

  it('prefers an explicit season id', () => {
    expect(resolveSeasonId(seasons, 3, '2026')).toBe(3);
  });

  it('resolves a year against season names', () => {
    expect(resolveSeasonId(seasons, null, '2021')).toBe(3);
    expect(resolveSeasonId(seasons, null, '2025')).toBe(4);
  });

  it('returns null when nothing matches', () => {
    expect(resolveSeasonId(seasons, null, '1999')).toBeNull();
    expect(resolveSeasonId(seasons, null, null)).toBeNull();
  });
});

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

describe('pickLeagueSeason', () => {
  it('returns the most recent league/season the teams play in', () => {
    const snapshot = makeSnapshot([
      makeGameday({ id: 1, date: '2026-04-01', league_display: 'FF BL', season_display: '2025' }),
      makeGameday({ id: 2, date: '2026-06-01', league_display: 'DKB DFFL', season_display: '2026' }),
    ]);
    for (const gameday of snapshot.gamedays) {
      gameday.games = [makeGame({ id: gameday.id })];
    }
    expect(pickLeagueSeason(snapshot, [159])).toEqual({
      leagueName: 'DKB DFFL',
      seasonName: '2026',
    });
  });

  it('ignores gamedays without the team and returns null when empty', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [
          makeGame({
            results: [
              { id: 1, team_id: 500, team_name: 'A', fh: 0, sh: 0, pa: 0, isHome: true },
              { id: 2, team_id: 501, team_name: 'B', fh: 0, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
    ]);
    expect(pickLeagueSeason(snapshot, [159])).toBeNull();
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
    const games = activeWatchedGames(snapshot, [159]);
    expect(games.map((game) => game.gameId)).toEqual([11, 13]);
    expect(games[0]).toMatchObject({ teamId: 159, isHome: true, opponent: 'Sharks' });
  });

  it('de-duplicates a game watched by two configured teams', () => {
    const snapshot = makeSnapshot([
      makeGameday({ games: [makeGame({ id: 11, status: 'Geplant' })] }),
    ]);
    const games = activeWatchedGames(snapshot, [159, 200]);
    expect(games.map((game) => game.gameId)).toEqual([11]);
  });
});
