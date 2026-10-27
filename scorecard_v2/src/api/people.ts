import { apiGet } from "./client";
import type { TeamOfficial } from "./types";

/**
 * Progressive person search for the scorecard's pickers.
 *
 * `GET /api/officials/search/list` is the typing-friendly sibling of the
 * scorecard's name search: one name part is enough, every team is searched,
 * and "nobody found" is an empty list instead of a `404`. The `team` stays in
 * the query as a *ranking* hint, not a filter — a guest official is still a
 * person the crew can include.
 */
export function searchOfficials(
  query: string,
  teamId: number | null,
  limit = 10,
): Promise<TeamOfficial[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    limit: String(limit),
  });
  if (teamId !== null) {
    params.set("team", String(teamId));
  }
  return apiGet<TeamOfficial[]>(
    `/api/officials/search/list?${params.toString()}`,
  );
}
