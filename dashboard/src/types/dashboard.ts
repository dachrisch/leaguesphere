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

// SaaS Admin Dashboard Types

export interface PlatformHealth {
  active_today: number;
  active_7d: number;
  trend_7d: number;
  total_users: number;
  team_managers: number;
  officials: number;
  players: number;
  new_users_30d: number;
  avg_new_per_week: number;
}

export interface RecentAction {
  action_type: string;
  action_time: string;
  user_name: string;
  user_role: string;
  description: string;
}

export interface OnlineUser {
  user_name: string;
  user_role: string;
  team: string;
}

export interface Publisher {
  name: string;
  count: number;
}

export interface TeamActivity {
  name: string;
  changes: number;
}

export interface TeamActivityDetail {
  name: string;
  roster_changes: number;
  verifications: number;
  total_activity: number;
}

export interface ContentCreation {
  gamedays_published: number;
  avg_games_per_gameday: number;
  top_publishers: Publisher[];
  new_players: number;
  transfers: number;
  players_left: number;
  top_teams_roster: TeamActivity[];
  verifications: number;
}

export interface FeatureUsage {
  total_games: number;
  scorecard_adoption: number;
  scorecard_games: number;
  scorecard_events: number;
  scorecard_avg_events: number;
  liveticker_adoption: number;
  liveticker_games: number;
  passcheck_verifications: number;
  passcheck_teams: number;
}

export interface RoleSegment {
  total: number;
  active_30d: number;
  activity_rate: number;
}

export interface UserSegments {
  team_managers: RoleSegment;
  officials: RoleSegment;
  players: RoleSegment;
  top_teams: TeamActivityDetail[];
}

export interface InactiveUser {
  name: string;
  team: string;
  joined_days_ago?: number;
}

export interface InactiveTeam {
  name: string;
}

export interface InactiveTeamManagers {
  total: number;
  never_active: InactiveUser[];
  recently_inactive: InactiveUser[];
}

export interface InactiveTeams {
  total: number;
  teams: InactiveTeam[];
}

export interface ProblemAlerts {
  inactive_team_managers: InactiveTeamManagers;
  inactive_teams: InactiveTeams;
  unused_accounts: number;
}

export interface TeamUserCount {
  team_name: string;
  user_count: number;
  association: string;
}

export interface UsersPerTeam {
  teams: TeamUserCount[];
  total_teams_with_users: number;
  total_users_with_teams: number;
  users_without_team: number;
}
