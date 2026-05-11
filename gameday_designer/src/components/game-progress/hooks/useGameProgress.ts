import { useEffect, useState, useCallback } from 'react';
import { progressApi, type ProgressApiParams } from '../../../api/progressApi';
import type { GamedayProgress, GameProgressState } from '../../../types/progressTypes';

function categorizeGamedays(gamedays: GamedayProgress[]): Omit<GameProgressState, 'loading' | 'error' | 'gamedays'> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const live: GamedayProgress[] = [];
  const soon: GamedayProgress[] = [];
  const todayGamedays: GamedayProgress[] = [];
  const recent: GamedayProgress[] = [];
  const upcoming: GamedayProgress[] = [];

  let totalLiveGames = 0;

  gamedays.forEach((gameday) => {
    const gamedayDate = new Date(gameday.date);
    gamedayDate.setHours(0, 0, 0, 0);

    const hasLiveGame = gameday.games.some((game) => game.status === 'Gestartet');
    const allGamesFinished = gameday.games.every((game) => game.status === 'beendet');

    if (hasLiveGame) {
      live.push(gameday);
      totalLiveGames += gameday.games.filter((g) => g.status === 'Gestartet').length;
    } else if (gamedayDate.getTime() === today.getTime()) {
      todayGamedays.push(gameday);
    } else if (gamedayDate > today) {
      const daysFromNow = Math.ceil((gamedayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromNow <= 7) {
        soon.push(gameday);
      } else {
        upcoming.push(gameday);
      }
    } else if (gamedayDate >= sevenDaysAgo && gamedayDate < today) {
      recent.push(gameday);
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
