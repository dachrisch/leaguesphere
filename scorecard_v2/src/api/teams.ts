/**
 * The team directory, reduced to the one thing the field app needs: a logo per
 * team name.
 *
 * `GET /api/teams/` is the public directory the widget already uses. It is
 * paginated (`count`/`next`/`previous`/`results`, 100 per page, `page_size` up
 * to 1000) and its `logo` is an absolute URL — or `null` when the team never
 * uploaded one. The directory also carries `description`, the short name the
 * gameday payloads show in the game list, while the log uses `name`; both are
 * keys of the lookup, so a screen can pass whichever it has.
 *
 * Two rules:
 *
 * - **One load.** Every screen reads the same map; the map is cached in the
 *   offline snapshot store under {@link snapshotKey.teams}, so the field device
 *   keeps its logos after one online load.
 * - **Logos are decoration.** A failed or offline read never throws: it answers
 *   with the cached map, or an empty one, and the screens keep the initials
 *   circle they had before.
 */
import { apiGet } from "./client";
import { readSnapshot, snapshotKey, writeSnapshot } from "../offline/snapshot";

/** One entry of `GET /api/teams/` (`TeamSerializer` in `gamedays`). */
export interface TeamDirectoryEntry {
  id: number;
  /** `Team.name`, the long name the game log shows. */
  name: string;
  /** `Team.description`, the short name the game list shows. */
  description: string;
  /** Absolute URL, or `null` when the team has no logo. */
  logo: string | null;
}

/** The paginated envelope `GET /api/teams/` answers with. */
export interface TeamsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: TeamDirectoryEntry[];
}

/** Normalised team name → logo URL. Lookup goes through {@link teamKey}. */
export type TeamLogos = ReadonlyMap<string, string>;

/** One page holds 100 by default; asking for the maximum keeps it to one. */
const PAGE_SIZE = 1000;

/**
 * Upper bound on followed `next` links. A directory that never ends must not
 * turn the boot into an endless request loop; 20 pages are 20 000 teams.
 */
const MAX_PAGES = 20;

/**
 * The lookup key for a team name: trimmed and lower case, so `Team.name`,
 * `Team.description` and the payloads' own spelling all hit the same entry.
 * A blank name has no key and therefore no logo.
 */
export function teamKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * Build the lookup from directory entries. A team without a logo (or with a
 * blank one) is left out on purpose: the screens then render the initials
 * instead of an empty image.
 */
export function teamLogosFrom(
  entries: readonly TeamDirectoryEntry[],
): Map<string, string> {
  const logos = new Map<string, string>();
  for (const entry of entries) {
    const logo = entry.logo?.trim() ?? "";
    if (logo === "") {
      continue;
    }
    for (const label of [entry.name, entry.description]) {
      const key = teamKey(label);
      if (key !== "") {
        logos.set(key, logo);
      }
    }
  }
  return logos;
}

/**
 * A `next` link as a same-origin path: the host and scheme DRF derives can be
 * wrong behind a proxy, and a cross-origin fetch would be a mixed-content
 * block.
 */
function sameOriginPath(link: string): string {
  try {
    const url = new URL(link, globalThis.location?.href ?? "http://localhost");
    return `${url.pathname}${url.search}`;
  } catch {
    return link;
  }
}

/** The directory, every page of it. A bucket that answers with a list works. */
async function fetchTeams(): Promise<TeamDirectoryEntry[]> {
  const entries: TeamDirectoryEntry[] = [];
  // A page that links to itself would otherwise be fetched MAX_PAGES times.
  const visited = new Set<string>();
  let path: string | null = `/api/teams/?page_size=${PAGE_SIZE}`;
  while (path !== null && visited.size < MAX_PAGES) {
    visited.add(path);
    const body: TeamsPage | TeamDirectoryEntry[] = await apiGet<
      TeamsPage | TeamDirectoryEntry[]
    >(path);
    if (Array.isArray(body)) {
      entries.push(...body);
      break;
    }
    entries.push(...(body.results ?? []));
    const next: string | null =
      body.next === null ? null : sameOriginPath(body.next);
    path = next !== null && !visited.has(next) ? next : null;
  }
  return entries;
}

/** The store keeps pairs, not a `Map`: plain data survives any IndexedDB. */
type StoredPairs = [string, string][];

async function readCachedLogos(): Promise<Map<string, string> | undefined> {
  const saved = await readSnapshot<StoredPairs>(snapshotKey.teams());
  if (saved === undefined || !Array.isArray(saved.value)) {
    return undefined;
  }
  const logos = new Map<string, string>();
  for (const pair of saved.value) {
    if (
      Array.isArray(pair) &&
      typeof pair[0] === "string" &&
      typeof pair[1] === "string"
    ) {
      logos.set(pair[0], pair[1]);
    }
  }
  return logos;
}

/**
 * Load the directory once and answer with the name→logo lookup.
 *
 * Never rejects: without a network and without a cache the map is empty and the
 * screens fall back to the initials.
 *
 * An answer without a single logo never replaces the cache. A degraded payload
 * (a renamed list key, a transient empty page) parses to an empty map, and
 * writing that over a good cache would leave every later offline boot — the
 * one case the cache exists for — without logos.
 */
export async function loadTeamLogos(): Promise<TeamLogos> {
  const cached = await readCachedLogos();
  if (globalThis.navigator?.onLine === false && cached !== undefined) {
    return cached;
  }
  try {
    const logos = teamLogosFrom(await fetchTeams());
    if (logos.size === 0) {
      return cached ?? logos;
    }
    await writeSnapshot<StoredPairs>(snapshotKey.teams(), [...logos]);
    return logos;
  } catch {
    // Logos are decoration: a failed directory read must not reach a screen.
    return cached ?? new Map();
  }
}
