import type { ApiGame, ApiGameday, Snapshot } from '../lib/types';

export function makeGame(overrides: Partial<ApiGame> = {}): ApiGame {
  return {
    id: 1,
    gameday: 100,
    scheduled: '10:00',
    field: 1,
    officials: null,
    stage: '',
    standing: '',
    status: 'Geplant',
    results: [
      { id: 1, team_id: 159, team_name: 'Renegades', fh: 0, sh: 0, pa: 0, isHome: true },
      { id: 2, team_id: 200, team_name: 'Sharks', fh: 0, sh: 0, pa: 0, isHome: false },
    ],
    halftime_score: { home: 0, away: 0 },
    final_score: { home: 0, away: 0 },
    ...overrides,
  };
}

export function makeGameday(overrides: Partial<ApiGameday> = {}): ApiGameday {
  return {
    id: 100,
    name: 'Spieltag',
    season: 6,
    season_display: '2026',
    league: 3,
    league_display: 'DFFL',
    date: '2026-05-09',
    start: '10:00',
    format: 'CUSTOM',
    author: 1,
    address: 'Nürnberg',
    status: 'PUBLISHED',
    has_designer_state: false,
    games: [],
    ...overrides,
  };
}

export function makeSnapshot(gamedays: ApiGameday[]): Snapshot {
  return { generated_at: '2026-05-09T10:00:00Z', etag: 'x', gamedays };
}
