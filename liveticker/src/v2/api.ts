import type { Game } from "./types";

export async function fetchGames(
  league: string,
  gameday: string,
  signal: AbortSignal,
  allTicksFor: number[] = [],
): Promise<Game[]> {
  const params = new URLSearchParams();
  if (allTicksFor.length > 0) {
    params.set("getAllTicksFor", allTicksFor.join(","));
  }
  if (league) params.set("league", league);
  if (gameday) params.set("gameday", gameday);
  const query = params.toString();
  const response = await fetch(`/api/liveticker/${query ? `?${query}` : ""}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Liveticker antwortet mit ${response.status}`);
  }
  return (await response.json()) as Game[];
}
