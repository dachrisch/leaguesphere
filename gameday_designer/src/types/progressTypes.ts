/**
 * TypeScript types for Game Progress Dashboard
 */

export interface GameResult {
  home_score: number | null;
  guest_score: number | null;
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
  league: number;
  league_display: string;
  season: number;
  season_display: string;
  games: GameInfo[];
}

export type GamedayCategory = 'live' | 'soon' | 'today' | 'recent' | 'upcoming';

export interface GameProgressState {
  loading: boolean;
  error: Error | null;
  gamedays: GamedayProgress[];

  // Categorized groupings
  live: GamedayProgress[];
  soon: GamedayProgress[];
  today: GamedayProgress[];
  recent: GamedayProgress[];
  upcoming: GamedayProgress[];

  // Metadata
  totalLiveGames: number;
  todayGamedayCount: number;
}
