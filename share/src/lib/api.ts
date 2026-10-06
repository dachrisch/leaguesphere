import type { Snapshot, TeamDirectoryEntry } from './types';

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const JSON_HEADERS: RequestInit = { headers: { Accept: 'application/json' } };
/**
 * Snapshot reads always revalidate: the browser sends If-None-Match from its
 * HTTP cache and gets a cheap 304 when nothing changed.
 */
const SNAPSHOT_INIT: RequestInit = { ...JSON_HEADERS, cache: 'no-cache' };

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

async function getJson<T>(
  url: string,
  fetcher: Fetcher,
  init: RequestInit = JSON_HEADERS
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok) {
    throw new HttpError(response.status, parseRetryAfter(response));
  }
  return (await response.json()) as T;
}

export type SnapshotInclude = 'games' | 'teams' | 'standings' | 'live';

/** Public API contract version the widget understands (backend SCHEMA_VERSION). */
export const SNAPSHOT_SCHEMA_VERSION = 1;

export function assertSnapshotVersion(snapshot: Snapshot): void {
  if (
    snapshot.schema_version !== undefined &&
    snapshot.schema_version !== SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new HttpError(502, null);
  }
}

export interface SnapshotFilters {
  season?: number;
  /** Seasons whose name starts with this year ("2025" → "2025/2026"). */
  year?: string;
  league?: number;
  dateFrom?: string;
  dateTo?: string;
  include?: SnapshotInclude[];
}

/** /api/snapshot/ is the widget's only data source (the public API). */
export function snapshotUrl(teamIds: number[], filters: SnapshotFilters = {}): string {
  const params = new URLSearchParams();
  teamIds.forEach((id) => params.append('team', String(id)));
  params.set('include', (filters.include ?? ['games']).join(','));
  if (filters.season !== undefined) {
    params.set('season', String(filters.season));
  }
  if (filters.year !== undefined) {
    params.set('year', filters.year);
  }
  if (filters.league !== undefined) {
    params.set('league', String(filters.league));
  }
  if (filters.dateFrom !== undefined) {
    params.set('date_from', filters.dateFrom);
  }
  if (filters.dateTo !== undefined) {
    params.set('date_to', filters.dateTo);
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
  return getJson<Snapshot>(
    snapshotUrl(teamIds, filters),
    fetcher,
    SNAPSHOT_INIT
  ).then((snapshot) => {
    assertSnapshotVersion(snapshot);
    return snapshot;
  });
}

// The generator (a LeagueSphere page) also reads internal endpoints for its
// season list and team search; the embedded widget never does.

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
