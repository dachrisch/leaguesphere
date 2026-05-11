/**
 * useGameProgress Hook
 *
 * Fetches and groups gamedays by status (live, soon, today, recent, upcoming)
 * Handles loading, errors, and filtering
 */

import { useState, useEffect, useCallback } from 'react';
import { gameProgressApi, type GamedayProgress } from '../../../api/gameProgressApi';
import type { GameProgressState, GamedayStatus } from '../../../types/progress';

interface UseGameProgressFilters {
  dateFrom?: string;
  dateTo?: string;
  league?: number;
  season?: number;
  status?: string;
}

/**
 * Determine gameday status based on current time and game times
 */
function getGamedayStatus(gameday: GamedayProgress, now: Date): GamedayStatus {
  const gamedayDate = new Date(gameday.date);
  gamedayDate.setHours(0, 0, 0, 0);

  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);

  const isToday = gamedayDate.getTime() === todayDate.getTime();
  const isPast = gamedayDate.getTime() < todayDate.getTime();

  // Check if any game is currently live/in progress
  const liveGames = gameday.games.filter((g) => g.status === 'Gestartet');
  const hasLive = liveGames.length > 0;

  if (hasLive) return 'live';

  // Check if first game is within 30 minutes
  const firstGame = gameday.games[0];
  if (firstGame) {
    const firstGameTime = new Date(gameday.date + 'T' + firstGame.scheduled);
    const minsToKickoff = Math.round(
      (firstGameTime.getTime() - now.getTime()) / 60000
    );

    if (minsToKickoff >= 0 && minsToKickoff <= 30) {
      return 'soon';
    }
  }

  // If today and games haven't started yet
  if (isToday) {
    const allFinished = gameday.games.every((g) => g.status === 'beendet');
    if (!allFinished) return 'today';
  }

  // If gameday finished in last 24 hours
  if (isPast) {
    const lastGame = gameday.games[gameday.games.length - 1];
    if (lastGame && lastGame.gameFinished) {
      const lastGameEnd = new Date(gameday.date + 'T' + lastGame.gameFinished);
      const hoursSinceEnd = (now.getTime() - lastGameEnd.getTime()) / 3600000;

      if (hoursSinceEnd >= 0 && hoursSinceEnd < 24) {
        return 'recent';
      }
    }
  }

  // Future gameday
  return 'upcoming';
}

/**
 * Main hook for game progress dashboard
 */
export function useGameProgress(
  filters?: UseGameProgressFilters
): GameProgressState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<GameProgressState>({
    loading: true,
    error: null,
    gamedays: [],
    live: [],
    soon: [],
    today: [],
    recent: [],
    upcomingWeek: [],
    nextScheduled: null,
    liveGameCount: 0,
    todayGameDayCount: 0,
  });

  /**
   * Summarize a gameday: count games by status, calculate times
   */
  const summarizeGameday = useCallback(
    (gameday: GamedayProgress, now: Date) => {
      const played = gameday.games.filter((g) => g.status === 'beendet').length;
      const live = gameday.games.filter((g) => g.status === 'Gestartet').length;
      const upcoming = gameday.games.filter((g) => g.status === 'Geplant').length;

      const firstGame = gameday.games[0];
      const lastGame = gameday.games[gameday.games.length - 1];

      const firstStart = firstGame
        ? new Date(gameday.date + 'T' + firstGame.scheduled)
        : now;
      const lastEnd = lastGame?.gameFinished
        ? new Date(gameday.date + 'T' + lastGame.gameFinished)
        : lastGame
          ? new Date(gameday.date + 'T' + lastGame.scheduled)
          : now;

      return {
        status: getGamedayStatus(gameday, now),
        played,
        live,
        upcoming,
        firstStart,
        lastEnd,
      };
    },
    []
  );

  /**
   * Fetch gamedays from API
   */
  const fetchGamedays = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await gameProgressApi.listProgress(filters);
      const gamedays = response.results;

      const now = new Date();

      // Group and summarize gamedays
      const summarized = gamedays.map((gd) => ({
        gd,
        s: summarizeGameday(gd, now),
      }));

      const weekHorizon = new Date(now);
      weekHorizon.setDate(weekHorizon.getDate() + 7);

      const live = summarized.filter((x) => x.s.status === 'live');
      const soon = summarized.filter((x) => x.s.status === 'soon');
      const today = summarized.filter((x) => x.s.status === 'today');
      const recent = summarized
        .filter((x) => x.s.status === 'recent')
        .sort((a, b) => b.s.lastEnd.getTime() - a.s.lastEnd.getTime());

      const upcomingWeek = summarized
        .filter((x) => x.s.status === 'upcoming' && x.gd.date <= weekHorizon.toISOString().split('T')[0])
        .sort((a, b) => new Date(a.gd.date).getTime() - new Date(b.gd.date).getTime());

      const beyondWeek = summarized
        .filter((x) => x.s.status === 'upcoming' && x.gd.date > weekHorizon.toISOString().split('T')[0])
        .sort((a, b) => new Date(a.gd.date).getTime() - new Date(b.gd.date).getTime());

      const nextScheduled = beyondWeek[0] || null;

      const liveGameCount = live.reduce((n, x) => n + x.s.live, 0);
      const todayGameDayCount = summarized.filter(
        (x) => x.gd.date === now.toISOString().split('T')[0]
      ).length;

      setState({
        loading: false,
        error: null,
        gamedays,
        live,
        soon,
        today,
        recent,
        upcomingWeek,
        nextScheduled,
        liveGameCount,
        todayGameDayCount,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err : new Error('Unknown error'),
        gamedays: [],
        live: [],
        soon: [],
        today: [],
        recent: [],
        upcomingWeek: [],
        nextScheduled: null,
        liveGameCount: 0,
        todayGameDayCount: 0,
      }));
    }
  }, [filters, summarizeGameday]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchGamedays();
  }, [fetchGamedays]);

  return {
    ...state,
    refetch: fetchGamedays,
  };
}
