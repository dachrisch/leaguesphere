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

export interface Snapshot {
  generated_at: string;
  etag: string;
  gamedays: ApiGameday[];
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

export interface LiveGame {
  gameId: number;
  status: string;
  standing: string;
  time: string;
  home: LiveTeamSide;
  away: LiveTeamSide;
  ticks: LiveTick[];
}

export interface LeagueRef {
  slug: string;
  name: string;
}

export interface StandingRow {
  standing: string;
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
  season: { slug: string; name: string };
  standing: StandingRow[];
}
