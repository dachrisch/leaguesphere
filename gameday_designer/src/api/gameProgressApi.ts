/**
 * Game Progress API Service
 *
 * Handles communication with /api/progress/ endpoint
 * Returns denormalized gameday data with all games and results
 */

export interface GameResult {
  home_score: number | null;
  away_score: number | null;
  home: number;
  away: number;
}

export interface GameInfo {
  id: number;
  scheduled: string; // HH:MM
  status: string; // 'Geplant', 'Gestartet', 'beendet'
  gameStarted: string | null; // HH:MM
  gameFinished: string | null; // HH:MM
  field: number;
  stage: string;
  standing: string;
  result?: GameResult;
}

export interface GamedayProgress {
  id: number;
  name: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  status: string;
  league: number;
  league_display: string;
  season: number;
  season_display: string;
  games: GameInfo[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface GameProgressParams {
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
  league?: number;
  season?: number;
  status?: string;
  pageSize?: number;
}

export const gameProgressApi = {
  /**
   * Fetch list of gamedays with progress status
   */
  listProgress: async (
    params?: GameProgressParams
  ): Promise<PaginatedResponse<GamedayProgress>> => {
    const queryParams = new URLSearchParams();

    if (params?.dateFrom) queryParams.append('date_from', params.dateFrom);
    if (params?.dateTo) queryParams.append('date_to', params.dateTo);
    if (params?.league) queryParams.append('league', String(params.league));
    if (params?.season) queryParams.append('season', String(params.season));
    if (params?.status) queryParams.append('status', params.status);
    if (params?.pageSize) queryParams.append('page_size', String(params.pageSize));

    const queryString = queryParams.toString();
    const url = `/api/progress/${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch game progress: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Fetch a single gameday with all games
   */
  getGameday: async (id: number): Promise<GamedayProgress> => {
    const response = await fetch(`/api/progress/${id}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch gameday: ${response.statusText}`);
    }

    return response.json();
  },
};
