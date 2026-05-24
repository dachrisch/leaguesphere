import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGameProgress } from '../hooks/useGameProgress';
import { progressApi } from '../../../api/progressApi';
import { GameStatus } from '../../../types/progressTypes';

vi.mock('../../../api/progressApi', () => ({
  progressApi: {
    list: vi.fn(),
  },
}));

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
    const mockGameday = {
      id: 1,
      name: 'Today Gameday',
      date: '2026-05-24',
      start: '14:00:00',
      games: [
        { id: 101, status: GameStatus.PLANNED, scheduled: '14:00:00' }
      ],
      stats: { total: 1, played: 0, live: 0, pending: 1, percentComplete: 0 }
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as any]);

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
    const mockGameday = {
      id: 2,
      name: 'Finished Today',
      date: '2026-05-24',
      start: '08:00:00',
      games: [
        { id: 201, status: GameStatus.COMPLETED, scheduled: '08:00:00' }
      ],
      stats: { total: 1, played: 1, live: 0, pending: 0, percentComplete: 100 }
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as any]);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.live).toHaveLength(1);
    expect(result.current.live[0].isStale).toBe(false);
    expect(result.current.today).toHaveLength(0);
  });

  it('should mark an unstarted gameday as stale if it is long past its end time', async () => {
    // End time is start + 2h = 10:00. Now is 12:00.
    const mockGameday = {
      id: 3,
      name: 'Stale Today',
      date: '2026-05-24',
      start: '08:00:00',
      games: [
        { id: 301, status: GameStatus.PLANNED, scheduled: '08:00:00' }
      ],
      stats: { total: 1, played: 0, live: 0, pending: 1, percentComplete: 0 }
    };

    vi.mocked(progressApi.list).mockResolvedValue([mockGameday as any]);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.live).toHaveLength(0);
    expect(result.current.today).toHaveLength(1);
    expect(result.current.today[0].isStale).toBe(true);
  });

  it('should calculate totalPlayedGamesToday correctly', async () => {
    const mockGamedays = [
      {
        id: 1,
        date: '2026-05-24',
        name: 'G1',
        start: '12:00:00',
        games: [{ status: GameStatus.COMPLETED }, { status: GameStatus.COMPLETED }],
        stats: { total: 2, played: 2, live: 0, pending: 0 }
      },
      {
        id: 2,
        date: '2026-05-24',
        name: 'G2',
        start: '12:00:00',
        games: [{ status: GameStatus.COMPLETED }, { status: GameStatus.IN_PROGRESS }],
        stats: { total: 2, played: 1, live: 1, pending: 0 }
      }
    ];

    vi.mocked(progressApi.list).mockResolvedValue(mockGamedays as any);

    const { result } = renderHook(() => useGameProgress());

    await vi.waitFor(() => expect(result.current.loading).toBe(false), { timeout: 1000 });

    expect(result.current.totalPlayedGamesToday).toBe(3);
  });
});
