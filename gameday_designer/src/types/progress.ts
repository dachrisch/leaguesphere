/**
 * TypeScript types for Game Progress Dashboard
 */

import type { GamedayProgress } from '../api/gameProgressApi';

/**
 * Computed summary for a gameday
 */
export interface GamedaySummary {
  gd: GamedayProgress;
  s: {
    status: 'live' | 'paused' | 'soon' | 'today' | 'recent' | 'upcoming';
    played: number;
    live: number;
    upcoming: number;
    firstStart: Date;
    lastEnd: Date;
  };
}

/**
 * State for useGameProgress hook
 */
export interface GameProgressState {
  loading: boolean;
  error: Error | null;
  gamedays: GamedayProgress[];

  // Computed groupings
  live: GamedaySummary[];
  soon: GamedaySummary[];
  today: GamedaySummary[];
  recent: GamedaySummary[];
  upcomingWeek: GamedaySummary[];
  nextScheduled: GamedaySummary | null;

  // Metadata
  liveGameCount: number;
  todayGameDayCount: number;
}

/**
 * Game status type
 */
export type GameStatus = 'Geplant' | 'Gestartet' | 'beendet' | string;

/**
 * Gameday status during a specific time
 */
export type GamedayStatus = 'live' | 'paused' | 'soon' | 'today' | 'recent' | 'upcoming';
