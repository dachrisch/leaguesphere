import type { GamedayProgress } from '../types/progressTypes';

const BASE = '/api/game-progress/';

export interface ProgressApiParams {
  league?: string;
  season?: string;
}

async function list(params?: ProgressApiParams): Promise<GamedayProgress[]> {
  const url = new URL(BASE, window.location.origin);

  if (params?.league) {
    url.searchParams.set('league', params.league);
  }
  if (params?.season) {
    url.searchParams.set('season', params.season);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch game progress: ${response.statusText}`);
  }

  const data = await response.json();

  // Handle paginated response
  if (data.results) {
    return data.results;
  }

  return data;
}

export const progressApi = {
  list,
};
