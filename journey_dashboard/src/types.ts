export interface JourneyEvent {
  id: number;
  event_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Journey {
  id: number;
  user: number;
  started_at: string;
  ended_at: string | null;
  events: JourneyEvent[];
}

export interface JourneyStats {
  event_name: string;
  count: number;
}

export interface AdoptionStats {
  opens: number;
  published?: number;
  templates?: number;
  completed?: number;
  matches?: number;
}

export interface GlobalAdoptionResponse {
  gameday: AdoptionStats;
  passcheck: AdoptionStats;
  scorecard: AdoptionStats;
}

export interface StatsResponse {
  stats: JourneyStats[];
  total_events: number;
  unique_event_types: number;
}

/**
 * Game creation statistics: designer vs legacy breakdown
 */
export interface TimePeriodStats {
  designer: number;
  legacy: number;
  total: number;
  designer_percentage: number;
}

export interface LeagueAdoptionStat {
  league_name: string;
  league_id: number;
  designer: number;
  legacy: number;
  total: number;
  designer_percentage: number;
}

export interface GameCreationStatsResponse {
  summary: Record<string, TimePeriodStats>;  // "7" | "30" | "90"
  by_league: Record<string, LeagueAdoptionStat[]>;  // "7" | "30" | "90"
}
