import type { Game } from "./types";

/** Query string shared by the JSON endpoint and the SSE endpoint. */
export function tickerQuery(
  league: string,
  gameday: string,
  allTicksFor: number[] = [],
): string {
  const params = new URLSearchParams();
  if (allTicksFor.length > 0) {
    params.set("getAllTicksFor", allTicksFor.join(","));
  }
  if (league) params.set("league", league);
  if (gameday) params.set("gameday", gameday);
  params.set("results", "all");
  return params.toString();
}

export function streamUrl(
  league: string,
  gameday: string,
  allTicksFor: number[] = [],
): string {
  return `/api/liveticker/stream/?${tickerQuery(league, gameday, allTicksFor)}`;
}

export async function fetchGames(
  league: string,
  gameday: string,
  signal: AbortSignal,
  allTicksFor: number[] = [],
): Promise<Game[]> {
  const query = tickerQuery(league, gameday, allTicksFor);
  const response = await fetch(`/api/liveticker/?${query}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Liveticker antwortet mit ${response.status}`);
  }
  return (await response.json()) as Game[];
}
