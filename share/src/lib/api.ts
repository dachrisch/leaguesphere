import type {
  LeagueTable,
  LiveGame,
  Snapshot,
  TeamDirectoryEntry,
} from './types';

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const JSON_HEADERS: RequestInit = { headers: { Accept: 'application/json' } };

/** Cap on how long we honour a `Retry-After` before retrying once. */
export const RETRY_AFTER_CAP_SECONDS = 30;
const RETRY_AFTER_DEFAULT_SECONDS = 1;

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, retryAfterSeconds: number | null = null) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (header === null) {
    return null;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * Delay before the single retry of a throttled (429) read, in ms — or null
 * when the error is not retryable. Honours `Retry-After`, capped so a huge
 * value cannot stall the widget forever.
 */
export function retryDelayMs(error: unknown): number | null {
  if (!(error instanceof HttpError) || error.status !== 429) {
    return null;
  }
  const seconds = Math.min(
    error.retryAfterSeconds ?? RETRY_AFTER_DEFAULT_SECONDS,
    RETRY_AFTER_CAP_SECONDS
  );
  return seconds * 1000;
}

async function getJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, JSON_HEADERS);
  if (!response.ok) {
    throw new HttpError(response.status, parseRetryAfter(response));
  }
  return (await response.json()) as T;
}

export interface SnapshotFilters {
  season?: number;
  league?: number;
}

export function snapshotUrl(teamIds: number[], filters: SnapshotFilters = {}): string {
  const params = new URLSearchParams();
  teamIds.forEach((id) => params.append('team', String(id)));
  params.set('include', 'games');
  if (filters.season !== undefined) {
    params.set('season', String(filters.season));
  }
  if (filters.league !== undefined) {
    params.set('league', String(filters.league));
  }
  return `/api/snapshot/?${params.toString()}`;
}

export function fetchSnapshot(
  teamIds: number[],
  filtersOrFetcher: SnapshotFilters | Fetcher = {},
  maybeFetcher: Fetcher = fetch
): Promise<Snapshot> {
  const filters =
    typeof filtersOrFetcher === 'function' ? {} : filtersOrFetcher;
  const fetcher =
    typeof filtersOrFetcher === 'function' ? filtersOrFetcher : maybeFetcher;
  return getJson<Snapshot>(snapshotUrl(teamIds, filters), fetcher);
}

export function seasonsUrl(): string {
  return '/api/seasons/';
}

export function fetchSeasons(
  fetcher: Fetcher = fetch
): Promise<{ id: number; name: string }[]> {
  return getJson('/api/seasons/', fetcher);
}

export function teamsUrl(search: string): string {
  const params = new URLSearchParams({ search, page_size: '50' });
  return `/api/teams/?${params.toString()}`;
}

export async function fetchTeams(
  search: string,
  fetcher: Fetcher = fetch
): Promise<TeamDirectoryEntry[]> {
  const data = await getJson<{ results: TeamDirectoryEntry[] }>(
    teamsUrl(search),
    fetcher
  );
  return data.results;
}

export function fetchLiveticker(fetcher: Fetcher = fetch): Promise<LiveGame[]> {
  return getJson<LiveGame[]>('/api/liveticker/', fetcher);
}

export function leagueTableUrl(slug: string, season?: string): string {
  const base = `/api/league-table/${encodeURIComponent(slug)}/`;
  return season === undefined
    ? base
    : `${base}${encodeURIComponent(season)}/`;
}

export function fetchLeagueTable(
  slug: string,
  season?: string,
  fetcher: Fetcher = fetch
): Promise<LeagueTable> {
  return getJson<LeagueTable>(leagueTableUrl(slug, season), fetcher);
}

export function fetchLeagues(
  fetcher: Fetcher = fetch
): Promise<{ id: number; name: string; slug: string }[]> {
  return getJson('/api/leagues/', fetcher);
}
