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

async function getJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, JSON_HEADERS);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function snapshotUrl(teamIds: number[]): string {
  const params = new URLSearchParams();
  teamIds.forEach((id) => params.append('team', String(id)));
  params.set('include', 'games');
  return `/api/snapshot/?${params.toString()}`;
}

export function fetchSnapshot(
  teamIds: number[],
  fetcher: Fetcher = fetch
): Promise<Snapshot> {
  return getJson<Snapshot>(snapshotUrl(teamIds), fetcher);
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

export function leagueTableUrl(slug: string, season: string): string {
  return `/api/league-table/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/`;
}

export function fetchLeagueTable(
  slug: string,
  season: string,
  fetcher: Fetcher = fetch
): Promise<LeagueTable> {
  return getJson<LeagueTable>(leagueTableUrl(slug, season), fetcher);
}

export function fetchLeagues(
  fetcher: Fetcher = fetch
): Promise<{ id: number; name: string; slug: string }[]> {
  return getJson('/api/leagues/', fetcher);
}
