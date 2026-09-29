import { describe, expect, it } from 'vitest';

import { buildTeamSchedule, formatTime, isFinal, isLive } from '../lib/schedule';
import type { ApiGame, ApiGameday, Snapshot } from '../lib/types';

function makeGame(overrides: Partial<ApiGame> = {}): ApiGame {
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

function makeGameday(overrides: Partial<ApiGameday> = {}): ApiGameday {
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

function makeSnapshot(gamedays: ApiGameday[]): Snapshot {
  return { generated_at: '2026-05-09T10:00:00Z', etag: 'x', gamedays };
}

const TODAY = '2026-05-01';

describe('formatTime', () => {
  it('drops seconds from a HH:MM:SS value', () => {
    expect(formatTime('12:20:00')).toBe('12:20');
  });

  it('keeps an already short HH:MM value', () => {
    expect(formatTime('09:05')).toBe('09:05');
  });
});

describe('status helpers', () => {
  it('recognises final and live game statuses', () => {
    expect(isFinal('beendet')).toBe(true);
    expect(isFinal('Geplant')).toBe(false);
    expect(isLive('Gestartet')).toBe(true);
    expect(isLive('1. Halbzeit')).toBe(true);
    expect(isLive('beendet')).toBe(false);
  });
});

describe('buildTeamSchedule', () => {
  it('only includes games the team plays in', () => {
    const gameday = makeGameday({
      games: [
        makeGame({ id: 1 }),
        makeGame({
          id: 2,
          results: [
            { id: 3, team_id: 500, team_name: 'Other', fh: 1, sh: 0, pa: 0, isHome: true },
            { id: 4, team_id: 501, team_name: 'Other2', fh: 0, sh: 0, pa: 0, isHome: false },
          ],
        }),
      ],
    });
    const schedule = buildTeamSchedule(makeSnapshot([gameday]), 159, TODAY);
    expect(schedule.teamName).toBe('Renegades');
    expect(schedule.upcoming.map((entry) => entry.gameId)).toEqual([1]);
    expect(schedule.past).toEqual([]);
  });

  it('splits final games into past and everything else into upcoming', () => {
    const gameday = makeGameday({
      games: [
        makeGame({ id: 1, status: 'beendet' }),
        makeGame({ id: 2, status: 'Geplant' }),
        makeGame({ id: 3, status: 'Gestartet' }),
      ],
    });
    const schedule = buildTeamSchedule(makeSnapshot([gameday]), 159, TODAY);
    expect(schedule.past.map((entry) => entry.gameId)).toEqual([1]);
    expect(schedule.upcoming.map((entry) => entry.gameId)).toEqual([2, 3]);
  });

  it('derives the score from the team perspective regardless of home/away', () => {
    const home = makeGameday({
      id: 100,
      games: [
        makeGame({
          id: 1,
          status: 'beendet',
          results: [
            { id: 1, team_id: 159, team_name: 'Renegades', fh: 2, sh: 1, pa: 0, isHome: true },
            { id: 2, team_id: 200, team_name: 'Sharks', fh: 1, sh: 0, pa: 0, isHome: false },
          ],
        }),
      ],
    });
    const away = makeGameday({
      id: 101,
      games: [
        makeGame({
          id: 2,
          status: 'beendet',
          results: [
            { id: 3, team_id: 200, team_name: 'Sharks', fh: 3, sh: 0, pa: 0, isHome: true },
            { id: 4, team_id: 159, team_name: 'Renegades', fh: 1, sh: 1, pa: 0, isHome: false },
          ],
        }),
      ],
    });
    const schedule = buildTeamSchedule(makeSnapshot([home, away]), 159, TODAY);
    const [playedHome, playedAway] = schedule.past;
    expect(playedHome.isHome).toBe(true);
    expect([playedHome.teamScore, playedHome.opponentScore]).toEqual([3, 1]);
    expect(playedAway.isHome).toBe(false);
    expect([playedAway.teamScore, playedAway.opponentScore]).toEqual([2, 3]);
    expect(playedAway.opponent).toBe('Sharks');
  });

  it('sorts both sections chronologically', () => {
    const gamedays = [
      makeGameday({ id: 1, date: '2026-06-01', games: [makeGame({ id: 11 })] }),
      makeGameday({ id: 2, date: '2026-05-01', games: [makeGame({ id: 22 })] }),
      makeGameday({ id: 3, date: '2026-04-01', games: [makeGame({ id: 33, status: 'beendet' })] }),
      makeGameday({ id: 4, date: '2026-03-01', games: [makeGame({ id: 44, status: 'beendet' })] }),
    ];
    const schedule = buildTeamSchedule(makeSnapshot(gamedays), 159, TODAY);
    expect(schedule.past.map((entry) => entry.gameId)).toEqual([44, 33]);
    expect(schedule.upcoming.map((entry) => entry.gameId)).toEqual([22, 11]);
  });

  it('normalises the kick-off time to HH:MM', () => {
    const gameday = makeGameday({
      games: [makeGame({ id: 1, scheduled: '12:20:00', status: 'Geplant' })],
    });
    const schedule = buildTeamSchedule(makeSnapshot([gameday]), 159, TODAY);
    expect(schedule.upcoming[0].time).toBe('12:20');
  });

  it('drops a past-dated unfinished game from both lists', () => {
    const gameday = makeGameday({
      date: '2023-05-13',
      games: [makeGame({ id: 1, status: 'Geplant' })],
    });
    const schedule = buildTeamSchedule(
      makeSnapshot([gameday]),
      159,
      '2026-09-29'
    );
    expect(schedule.past).toEqual([]);
    expect(schedule.upcoming).toEqual([]);
  });

  it('keeps a non-final game dated today in upcoming', () => {
    const gameday = makeGameday({
      date: '2026-09-29',
      games: [makeGame({ id: 1, status: 'Geplant' })],
    });
    const schedule = buildTeamSchedule(
      makeSnapshot([gameday]),
      159,
      '2026-09-29'
    );
    expect(schedule.upcoming.map((entry) => entry.gameId)).toEqual([1]);
  });

  it('returns an empty schedule when the team has no games', () => {
    const schedule = buildTeamSchedule(makeSnapshot([]), 159, TODAY);
    expect(schedule.teamName).toBe('');
    expect(schedule.past).toEqual([]);
    expect(schedule.upcoming).toEqual([]);
  });
});
