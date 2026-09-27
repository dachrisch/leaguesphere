import { describe, expect, it } from 'vitest';

import { activeWatchedGames } from '@/lib/live';
import { pickLeagueSeason, slugify } from '@/lib/table';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('2026')).toBe('2026');
    expect(slugify('DKB DFFL')).toBe('dkb-dffl');
    expect(slugify('  Saison 2026/27 ')).toBe('saison-2026-27');
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
