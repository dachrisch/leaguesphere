import { useEffect, useState, useCallback } from 'react';
import { progressApi, type ProgressApiParams } from '../../../api/progressApi';
import type { GamedayProgress, GamedayWithStats, GamedayStats, GameProgressState } from '../../../types/progressTypes';
import { GameStatus } from '../../../types/progressTypes';

function calculateStats(gameday: GamedayProgress): GamedayStats {
  const total = gameday.games.length;
  const played = gameday.games.filter((g) => g.status === GameStatus.COMPLETED).length;
  const live = gameday.games.filter((g) => g.status === GameStatus.IN_PROGRESS).length;
  const pending = gameday.games.filter((g) => g.status === GameStatus.PLANNED).length;

  return {
    total,
    played,
    live,
    pending,
    percentComplete: total > 0 ? Math.round((played / total) * 100) : 0,
  };
}

function addStats(gameday: GamedayProgress): GamedayWithStats {
  return {
    ...gameday,
    stats: calculateStats(gameday),
  };
}

function calculateMinutesUntilStart(dateStr: string, timeStr: string): number {
  const now = new Date();
  const minutesUntil = Math.floor(
    (new Date(`${dateStr}T${timeStr}`).getTime() - now.getTime()) / (1000 * 60)
  );
  return minutesUntil > 0 ? minutesUntil : 0;
}

function getLastGameTime(games: GameInfo[]): string | null {
  if (games.length === 0) return null;
  let lastTime = games[0].scheduled;
  for (const game of games) {
    if (game.scheduled > lastTime) {
      lastTime = game.scheduled;
    }
  }
  return lastTime;
}

function calculateGamedayEndTime(dateStr: string, games: GameInfo[]): Date {
  const lastGameTime = getLastGameTime(games);
  if (!lastGameTime) {
    return new Date(`${dateStr}T23:59:59`);
  }
  const endTime = new Date(`${dateStr}T${lastGameTime}`);
  endTime.setHours(endTime.getHours() + 2);
  return endTime;
}

function isGamedayFinished(stats: GamedayStats): boolean {
  return stats.pending === 0 && stats.live === 0;
}

function categorizeGamedays(gamedays: GamedayProgress[]): Omit<GameProgressState, 'loading' | 'error' | 'gamedays'> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const live: GamedayWithStats[] = [];
  const soon: GamedayWithStats[] = [];
  const todayGamedays: GamedayWithStats[] = [];
  const recent: GamedayWithStats[] = [];
  const upcoming: GamedayWithStats[] = [];

  let totalLiveGames = 0;

  gamedays.forEach((gameday) => {
    const gamedayWithStats = addStats(gameday);
    const gamedayDate = new Date(gameday.date);
    gamedayDate.setHours(0, 0, 0, 0);

    const isFinished = isGamedayFinished(gamedayWithStats.stats);
    const gamedayEndTime = calculateGamedayEndTime(gameday.date, gameday.games);
    const now = new Date();
    const isOngoing = !isFinished && now < gamedayEndTime;
    const isToday = gamedayDate.getTime() === today.getTime();

    if (isToday && isOngoing) {
      live.push(gamedayWithStats);
      totalLiveGames += gamedayWithStats.stats.live;
    } else if (isToday) {
      const gamedayEndTime = calculateGamedayEndTime(gameday.date, gameday.games);
      const endTimePlusTwoHours = new Date(gamedayEndTime.getTime() + 3 * 60 * 60 * 1000);
      const noGamesStarted = gamedayWithStats.stats.played === 0 && gamedayWithStats.stats.live === 0;
      const someGamesStarted = gamedayWithStats.stats.played > 0 || gamedayWithStats.stats.live > 0;
      const noGamesAtAll = gamedayWithStats.stats.total === 0;
      const isStale = noGamesAtAll || (now > gamedayEndTime && noGamesStarted) || (now > endTimePlusTwoHours && someGamesStarted);
      const withMinutes = {
        ...gamedayWithStats,
        minutesUntilStart: calculateMinutesUntilStart(gameday.date, gameday.start),
        isStale,
      };
      todayGamedays.push(withMinutes);
    } else if (gamedayDate > today) {
      const daysFromNow = Math.ceil((gamedayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromNow <= 7) {
        soon.push(gamedayWithStats);
      } else {
        upcoming.push(gamedayWithStats);
      }
    } else if (gamedayDate >= sevenDaysAgo && gamedayDate < today) {
      recent.push(gamedayWithStats);
    }
  });

  return {
    live,
    soon,
    today: todayGamedays,
    recent,
    upcoming,
    totalLiveGames,
    todayGamedayCount: todayGamedays.length,
  };
}

export { type GamedayWithStats, type GamedayStats };

export function useGameProgress(
  filters?: ProgressApiParams
): GameProgressState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<GameProgressState>({
    loading: true,
    error: null,
    gamedays: [],
    live: [],
    soon: [],
    today: [],
    recent: [],
    upcoming: [],
    totalLiveGames: 0,
    todayGamedayCount: 0,
  });

  const fetchGamedays = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const gamedays = await progressApi.list(filters);
      const categorized = categorizeGamedays(gamedays);
      setState({
        loading: false,
        error: null,
        gamedays,
        ...categorized,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err : new Error('Unknown error'),
      }));
    }
  }, [filters]);

  useEffect(() => {
    fetchGamedays();
  }, [fetchGamedays]);

  return { ...state, refetch: fetchGamedays };
}
