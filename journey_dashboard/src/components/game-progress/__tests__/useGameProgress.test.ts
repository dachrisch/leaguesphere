import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameProgress } from '../hooks/useGameProgress';
import { GamedayProgress, GameStatus } from '../../../types/progressTypes';
import { progressApi } from '../../../api/progressApi';

vi.mock('../../../api/progressApi');

describe('useGameProgress', () => {
  const mockNow = new Date('2026-05-24T12:00:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should categorize a today ongoing gameday as live and calculate minutes until start', async () => {
    const mockGameday: Partial<GamedayProgress> = {
      id: 1,
      name: 'Today Gameday',
      date: '2026-05-24',
      start: '14:00:00',
      games: [
        { id: 101, status: GameStatus.PLANNED, scheduled: '14:00:00', field: 1, gameStarted: null, gameFinished: null, gameresult: null }
      ],
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as GamedayProgress]);

    const { result } = renderHook(() => useGameProgress());

    // Use vi.waitFor instead of @testing-library/react's waitFor when using fake timers
    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.live).toHaveLength(1);
    // Allow for small timing variations if any, but 120 is expected
    expect(result.current.live[0].minutesUntilStart).toBeGreaterThanOrEqual(119);
    expect(result.current.live[0].minutesUntilStart).toBeLessThanOrEqual(120);
    expect(result.current.live[0].isStale).toBe(false);
  });

  it('should not mark a finished gameday as stale even if time has passed', async () => {
    const mockGameday: Partial<GamedayProgress> = {
      id: 2,
      name: 'Finished Today',
      date: '2026-05-24',
      start: '08:00:00',
      games: [
        { id: 201, status: GameStatus.COMPLETED, scheduled: '08:00:00', field: 1, gameStarted: '08:00:00', gameFinished: '09:00:00', gameresult: null }
      ],
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as GamedayProgress]);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.live).toHaveLength(1);
    expect(result.current.live[0].isStale).toBe(false);
    expect(result.current.today).toHaveLength(0);
  });

  it('should mark an unstarted gameday as stale if it is long past its end time', async () => {
    // End time is start + 2h = 10:00. Now is 12:00.
    const mockGameday: Partial<GamedayProgress> = {
      id: 3,
      name: 'Stale Today',
      date: '2026-05-24',
      start: '08:00:00',
      games: [
        { id: 301, status: GameStatus.PLANNED, scheduled: '08:00:00', field: 1, gameStarted: null, gameFinished: null, gameresult: null }
      ],
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as GamedayProgress]);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.live).toHaveLength(0);
    expect(result.current.today).toHaveLength(1);
    expect(result.current.today[0].isStale).toBe(true);
  });

  it('should calculate totalPlayedGamesToday correctly', async () => {
    const mockGamedays: Partial<GamedayProgress>[] = [
      {
        id: 1,
        date: '2026-05-24',
        name: 'G1',
        start: '12:00:00',
        games: [
          { status: GameStatus.COMPLETED, id: 1 },
          { status: GameStatus.COMPLETED, id: 2 }
        ] as unknown as GamedayProgress['games'],
      },
      {
        id: 2,
        date: '2026-05-24',
        name: 'G2',
        start: '12:00:00',
        games: [
          { status: GameStatus.COMPLETED, id: 3 },
          { status: GameStatus.IN_PROGRESS, id: 4 }
        ] as unknown as GamedayProgress['games'],
      }
    ];

    vi.mocked(progressApi.list).mockResolvedValue(mockGamedays as GamedayProgress[]);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.totalPlayedGamesToday).toBe(3);
  });
});
