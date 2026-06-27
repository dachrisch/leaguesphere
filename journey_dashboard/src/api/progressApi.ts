import type { GamedayProgress } from '../types/progressTypes';

const BASE = '/api/game-progress/';

export interface ProgressApiParams {
  league?: string;
  season?: string;
}

async function fetchPage(url: string): Promise<unknown> {
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
}

async function list(params?: ProgressApiParams): Promise<GamedayProgress[]> {
  const url = new URL(BASE, window.location.origin);

  if (params?.league) {
    url.searchParams.set('league', params.league);
  }
  if (params?.season) {
    url.searchParams.set('season', params.season);
  }

  // The endpoint is paginated, so walk every `next` page and concatenate the
  // results — otherwise only the first page is shown and gamedays beyond the
  // page boundary (e.g. today's games behind a full page of lookback) are lost.
  let nextUrl: string | null = url.toString();
  const gamedays: GamedayProgress[] = [];

  while (nextUrl) {
    const data = await fetchPage(nextUrl) as
      | { results?: GamedayProgress[]; next?: string | null }
      | GamedayProgress[];

    if (Array.isArray(data)) {
      // Non-paginated response: everything is on this single payload.
      gamedays.push(...data);
      break;
    }

    if (data.results) {
      gamedays.push(...data.results);
    }
    nextUrl = data.next ?? null;
  }

  return gamedays;
}

export const progressApi = {
  list,
};
