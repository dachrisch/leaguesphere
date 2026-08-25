/**
 * API types for Gameday Designer
 *
 * These types match the Django backend API models and responses.
 */

import type {
  FlowNode,
  FlowEdge,
  GlobalTeam,
  GlobalTeamGroup,
  StageCategory
} from './flowchart';

/**
 * Template slot representing a single game in the schedule template.
 * Corresponds to Django TemplateSlot model.
 */
export interface TemplateSlot {
  id: number;
  template: number;
  field: number;
  slot_order: number;
  stage: string;
  standing: string;
  home_group: number | null;
  home_team: number | null;
  home_reference: string;
  away_group: number | null;
  away_team: number | null;
  away_reference: string;
  officials_group: number | null;
  officials_team: number | null;
  officials_reference: string;
  break_after: number;
}

/**
 * Template update rule team configuration.
 * Corresponds to Django TemplateUpdateRuleTeam model.
 */
export interface TemplateUpdateRuleTeam {
  id: number;
  update_rule: number;
  role: 'home' | 'away' | 'officials';
  pre_finished_override: string;
}

/**
 * Template update rule for dynamic team assignment.
 * Corresponds to Django TemplateUpdateRule model.
 */
export interface TemplateUpdateRule {
  id: number;
  template: number;
  stage: string;
  standing: string;
  pre_finished: string;
  teams: TemplateUpdateRuleTeam[];
}

/**
 * Schedule template for gameday schedules.
 * Corresponds to Django ScheduleTemplate model.
 */
export interface ScheduleTemplate {
  id: number;
  name: string;
  num_teams: number;
  num_fields: number;
  num_groups: number;
  game_duration: number;
  description?: string;
  sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL';
  association: number | null;
  association_name?: string;
  created_by: number | null;
  created_by_username?: string;
  updated_by: number | null;
  updated_by_username?: string;
  created_at: string;
  updated_at: string;
  slots?: TemplateSlot[];
  update_rules?: TemplateUpdateRule[];
}

/**
 * Validation error from backend.
 */
export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  slot_id?: number;
  field?: string;
}

/**
 * Validation result from backend.
 */
export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Application result from applying a template to a gameday.
 */
export interface ApplicationResult {
  success: boolean;
  gameday_id?: number;
  gameinfos_created?: number;
  gameresults_created?: number;
  errors?: string[];
}

/**
 * Paginated response from DRF.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Generic API error response.
 */
export interface ApiError {
  detail?: string;
  [key: string]: unknown;
}

/**
 * Season model from backend.
 */
export interface Season {
  id: number;
  name: string;
}

/**
 * League model from backend.
 */
export interface League {
  id: number;
  name: string;
}

export interface ResourceUrl {
  id?: number;
  url: string;
  description: string;
}

/**
 * Gameday metadata for high-level management.
 * Corresponds to Django Gameday model fields.
 */
export interface GamedayMetadata {
  id: number;
  name: string;
  date: string;
  start: string;
  format: string;
  author: number;
  author_display?: string;
  address: string;
  season: number;
  season_display?: string;
  league: number;
  league_display?: string;
  status: string;
  /** True when the gameday already has entered results (scores / finished games /
   *  team logs). Regenerating the schedule would delete them, so unlock is blocked. */
  has_results?: boolean;
  resource_urls?: ResourceUrl[];
}

/**
 * Gameday list entry for the dashboard.
 */
export interface GamedayListEntry extends GamedayMetadata {
  status: string;
  has_designer_state?: boolean;
}

/**
 * Full Gameday structure including tournament designer data.
 */
export interface Gameday extends GamedayMetadata {
  has_designer_state?: boolean;
  designer_data?: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    globalTeams?: GlobalTeam[];
    globalTeamGroups?: GlobalTeamGroup[];
  };
}

/**
 * A single slot in a migration plan, describing one game's field/stage
 * placement and team assignments as reconstructed from a legacy gameday's
 * real schedule. Structurally mirrors GenericTemplateSlot
 * (utils/templateMapper.ts) plus the stage_category the migration endpoint
 * always backfills server-side.
 */
export interface MigrationPlanSlot {
  field: number;
  slot_order: number;
  stage: string;
  stage_type: 'STANDARD' | 'RANKING';
  stage_category: StageCategory;
  standing: string;
  home_group: number | null;
  home_team: number | null;
  home_reference: string;
  away_group: number | null;
  away_team: number | null;
  away_reference: string;
  official_group: number | null;
  official_team: number | null;
  official_reference: string;
  break_after: number;
}

/**
 * Response from GET /gamedays/<pk>/migration-plan/ -- a read-only
 * reconstruction of how an existing (pre-Designer) gameday's real schedule
 * maps onto a Designer canvas. Never persisted server-side; the frontend
 * turns it into a GenericTemplate for templateMapper's applyGenericTemplate()
 * and PUTs the result to the designer-state endpoint itself.
 */
export interface MigrationPlan {
  template_id: number;
  num_fields: number;
  num_groups: number;
  group_config: Array<{ name: string; team_count: number }>;
  slots: MigrationPlanSlot[];
  /** Key is `${group}_${team}` (both 0-based indices); label is the real Team.name string. */
  team_mapping: Record<string, { id: number; label: string }>;
  /** Human-readable notes about games that couldn't be reliably matched/mapped -- best-effort, not errors. */
  warnings: string[];
}

/**
 * Request payload for applying a template to a gameday.
 */
export interface ApplyTemplateRequest {
  gameday_id: number;
  team_mapping: { [key: string]: number };
  start_time?: string;       // HH:MM format
  game_duration?: number;
  break_duration?: number;
  num_fields?: number;
}

/**
 * Request payload for cloning a template.
 */
export interface CloneTemplateRequest {
  new_name: string;
}

/**
 * Preview response for template application.
 */
export interface TemplatePreview {
  games: Array<{
    field: number;
    slot_order: number;
    stage: string;
    standing: string;
    home_team: string;
    away_team: string;
    officials_team: string;
  }>;
}

/**
 * Template usage statistics.
 */
export interface TemplateUsage {
  template_id: number;
  template_name: string;
  gamedays: Array<{
    id: number;
    date: string;
    association_name: string;
  }>;
  usage_count: number;
}
