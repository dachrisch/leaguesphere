export interface DashboardSummary {
  total_games: number;
  live_games: number;
  total_teams: number;
  total_players: number;
  completion_rate: number;
}

export interface LiveGame {
  game_id: number;
  home_team: string;
  away_team: string;
  status: string;
  score: {
    home: number;
    away: number;
  };
  league: string;
  gameday: string;
}

export interface LeagueStats {
  league_id: number;
  league_name: string;
  total_games: number;
  total_teams: number;
  completion_rate: number;
}

export interface SeasonStats {
  season_id: number;
  season_name: string;
  total_games: number;
  completion_rate: number;
}

export interface AssociationStats {
  association_id: number;
  association_name: string;
  total_leagues: number;
  total_games: number;
  total_teams: number;
  completion_rate: number;
}
