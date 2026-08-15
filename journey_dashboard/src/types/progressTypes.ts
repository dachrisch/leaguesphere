/**
 * TypeScript types for Game Progress Dashboard
 */

export interface GameResult {
  fh: number | null;
  sh: number | null;
  pa: number | null;
}

export interface GameInfo {
  id: number;
  field: number;
  scheduled: string;
  status: string;
  gameStarted: string | null;
  gameFinished: string | null;
  gameresult: GameResult | null;
}

export interface GamedayProgress {
  id: number;
  name: string;
  date: string;
  start: string;
  status: string;
  computed_status?: string;
  league: number;
  league_display: string;
  season: number;
  season_display: string;
  games: GameInfo[];
}

export interface GamedayStats {
  total: number;
  played: number;
  live: number;
  pending: number;
  percentComplete: number;
}

export interface GamedayWithStats extends GamedayProgress {
  stats: GamedayStats;
  minutesUntilStart?: number;
  isStale?: boolean;
}

export type GamedayCategory = 'live' | 'soon' | 'today' | 'recent' | 'upcoming';

export interface GameProgressState {
  loading: boolean;
  error: Error | null;
  gamedays: GamedayProgress[];

  // Categorized groupings
  live: GamedayWithStats[];
  soon: GamedayWithStats[];
  today: GamedayWithStats[];
  recent: GamedayWithStats[];
  upcoming: GamedayWithStats[];

  // Metadata
  totalLiveGames: number;
  totalPlayedGamesToday: number;
  todayGamedayCount: number;
}

export const GameStatus = {
  PLANNED: 'Geplant',
  IN_PROGRESS: 'Gestartet',
  COMPLETED: 'beendet',
  FIRST_HALF: '1. Halbzeit',
  SECOND_HALF: '2. Halbzeit',
} as const;

// Statuses that mean a game is live right now. The live scoreboard flow
// (GameinfoWrapper) writes '1. Halbzeit' / '2. Halbzeit', while the REST PATCH
// flow writes 'Gestartet'. All three must be treated as in progress.
export const LIVE_STATUSES: readonly string[] = [
  GameStatus.IN_PROGRESS,
  GameStatus.FIRST_HALF,
  GameStatus.SECOND_HALF,
];
