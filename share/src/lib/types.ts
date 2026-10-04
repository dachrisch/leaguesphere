export interface ApiGameResult {
  id: number;
  team_id: number | null;
  team_name: string;
  fh: number;
  sh: number;
  pa: number;
  isHome: boolean;
}

export interface ApiGame {
  id: number;
  gameday: number;
  scheduled: string;
  field: number;
  officials: number | null;
  stage: string;
  standing: string;
  status: string;
  results: ApiGameResult[];
  halftime_score: { home: number; away: number };
  final_score: { home: number; away: number };
  /** Present with `include=live` on today's open games. */
  live?: SnapshotLive;
}

export interface ApiGameday {
  id: number;
  name: string;
  season: number;
  season_display: string;
  league: number;
  league_display: string;
  date: string;
  start: string;
  format: string;
  author: number;
  address: string;
  status: string;
  has_designer_state: boolean;
  games?: ApiGame[];
}

/** One entry of the snapshot's `teams` map (`include=teams`). */
export interface SnapshotTeam {
  name: string;
  description: string;
  logo: string | null;
}

/** The liveticker view of one open game (`include=live`). */
export interface SnapshotLive {
  status: string;
  time: string;
  home: LiveTeamSide;
  away: LiveTeamSide;
  ticks: LiveTick[];
}

export interface Snapshot {
  schema_version?: number;
  generated_at: string;
  etag: string;
  /** Echo of the request's filters (team ids etc.). */
  scope?: { team: number[] | null };
  gamedays: ApiGameday[];
  /** Keyed by team id as a string (`include=teams`). */
  teams?: Record<string, SnapshotTeam>;
  /** One table per configured league-season in scope (`include=standings`). */
  standings?: LeagueTable[];
}

export interface TeamDirectoryEntry {
  id: number;
  name: string;
  description: string;
  logo: string | null;
}

export interface LiveTeamSide {
  name: string;
  score: number;
  isInPossession: boolean;
}

export interface LiveTick {
  text: string;
  team: 'home' | 'away' | null;
  time: string;
}

export interface LiveGame extends SnapshotLive {
  gameId: number;
}

export interface LeagueRef {
  id: number;
  slug: string;
  name: string;
}

export interface StandingRow {
  /** Group label from the league table (e.g. "Gruppe 1"), not a position. */
  standing: string | null;
  group: string | null;
  /** 1-based position within the group. */
  rank: number;
  team_id: number;
  team__description: string;
  wins: number;
  draws: number;
  losses: number;
  games_played: number;
  pf: number;
  pa: number;
  diff: number;
  win_points: number;
  win_quotient: number;
}

export interface LeagueTable {
  league: LeagueRef;
  season: { id: number; slug: string; name: string };
  /** Tie-break step keys in ranking order, e.g. ["win_quotient", …]. */
  ranking: string[];
  rows: StandingRow[];
}
