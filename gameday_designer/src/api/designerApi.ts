/**
 * Designer API Client
 *
 * API client for communicating with the Django Gameday Designer backend.
 * Provides methods for CRUD operations on schedule templates and related actions.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  ScheduleTemplate,
  ValidationResult,
  ApplicationResult,
  PaginatedResponse,
  ApplyTemplateRequest,
  CloneTemplateRequest,
  TemplatePreview,
  TemplateUsage,
} from '../types';

export interface TeamRecord {
  id: number;
  name: string;
  association_id?: number | null;
  association_abbr?: string | null;
  association_name?: string | null;
}

export interface DesignerConfig {
  mock_teams: boolean;
  is_staff: boolean;
  username: string;
  avatar_url: string | null;
}

export interface SwissSetupRequest {
  seed_team_ids: number[];
  rounds: number;
  fields: number;
  game_duration: number;
  round_start_overrides?: Record<string, string>;
}

export interface SwissTournamentConfig {
  seedOrder: number[];
  rounds: number;
  fields: number;
  gameDuration: number;
  roundStartTimes: Record<string, string>;
  completedRounds: Array<{ round: number; gameIds: number[]; bye: number | null }>;
  byes: Record<string, number>;
}

export interface SwissPairing {
  home_team_id: number;
  away_team_id: number;
}

export interface SwissGeneratedRound {
  success: boolean;
  round: number;
  pairings: SwissPairing[];
  bye_team_id: number | null;
  game_ids: number[];
}

export interface SwissRoundPreview {
  success: boolean;
  round: number;
  pairings: SwissPairing[];
  bye_team_id: number | null;
  game_ids: number[];
}

export interface SwissGeneratePairingOverride {
  home_team_id: number;
  away_team_id: number;
  field?: number;
  start_time?: string;
}

export interface SwissGenerateOverrides {
  pairings: SwissGeneratePairingOverride[];
  bye_team_id?: number | null;
}

export interface SwissStandingRow {
  team_id: number;
  team_name: string;
  seed: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  byes: number;
  points: number;
}

export interface SwissStandings {
  standings: SwissStandingRow[];
  rounds_completed: number;
  rounds_total: number;
}

/**
 * API client class for Gameday Designer backend operations.
 */
class DesignerApi {
  private client: AxiosInstance;
  private configPromise: Promise<DesignerConfig> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/designer',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token if available
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Token ${token}`;
      }
      return config;
    });

    // Error interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle unauthorized - redirect to login
          window.location.href = '/accounts/login/';
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * List all schedule templates with optional filters.
   *
   * @param params - Optional filter parameters
   * @param params.association - Filter by association ID
   * @param params.search - Search query for template name
   * @param params.sharing - Filter by sharing scope (personal/association/global)
   * @returns Paginated list of templates
   */
  async listTemplates(params?: {
    association?: number;
    search?: string;
    sharing?: 'personal' | 'association' | 'global';
  }): Promise<PaginatedResponse<ScheduleTemplate>> {
    const response = await this.client.get<PaginatedResponse<ScheduleTemplate>>(
      '/templates/',
      { params }
    );
    return response.data;
  }

  /**
   * Get a single schedule template by ID.
   *
   * @param id - Template ID
   * @returns Template with all slots and update rules
   */
  async getTemplate(id: number): Promise<ScheduleTemplate> {
    const response = await this.client.get<ScheduleTemplate>(
      `/templates/${id}/`
    );
    return response.data;
  }

  /**
   * Create a new schedule template.
   *
   * @param data - Template data
   * @returns Created template
   */
  async createTemplate(
    data: Partial<ScheduleTemplate>
  ): Promise<ScheduleTemplate> {
    const response = await this.client.post<ScheduleTemplate>(
      '/templates/',
      data
    );
    return response.data;
  }

  /**
   * Update an existing template (full update with PUT).
   *
   * @param id - Template ID
   * @param data - Updated template data
   * @returns Updated template
   */
  async updateTemplate(
    id: number,
    data: Partial<ScheduleTemplate>
  ): Promise<ScheduleTemplate> {
    const response = await this.client.put<ScheduleTemplate>(
      `/templates/${id}/`,
      data
    );
    return response.data;
  }

  /**
   * Partially update a template (PATCH).
   *
   * @param id - Template ID
   * @param data - Fields to update
   * @returns Updated template
   */
  async patchTemplate(
    id: number,
    data: Partial<ScheduleTemplate>
  ): Promise<ScheduleTemplate> {
    const response = await this.client.patch<ScheduleTemplate>(
      `/templates/${id}/`,
      data
    );
    return response.data;
  }

  /**
   * Delete a schedule template.
   *
   * @param id - Template ID
   */
  async deleteTemplate(id: number): Promise<void> {
    await this.client.delete(`/templates/${id}/`);
  }

  /**
   * Validate a schedule template.
   *
   * @param id - Template ID
   * @returns Validation result with errors and warnings
   */
  async validateTemplate(id: number): Promise<ValidationResult> {
    const response = await this.client.get<ValidationResult>(
      `/templates/${id}/validate/`
    );
    return response.data;
  }

  /**
   * Apply a template to a gameday.
   *
   * @param id - Template ID
   * @param data - Application request with gameday ID and team mapping
   * @returns Application result with success status and created objects
   */
  async applyTemplate(
    id: number,
    data: ApplyTemplateRequest
  ): Promise<ApplicationResult> {
    const response = await this.client.post<ApplicationResult>(
      `/templates/${id}/apply/`,
      data
    );
    return response.data;
  }

  /**
   * Clone a template with a new name.
   *
   * @param id - Template ID to clone
   * @param data - Clone request with new name and optional association
   * @returns Cloned template
   */
  async cloneTemplate(
    id: number,
    data: CloneTemplateRequest
  ): Promise<ScheduleTemplate> {
    const response = await this.client.post<ScheduleTemplate>(
      `/templates/${id}/clone/`,
      data
    );
    return response.data;
  }

  /**
   * Preview how a template would be applied to a gameday.
   *
   * @param id - Template ID
   * @param gamedayId - Gameday ID to preview against
   * @returns Preview data showing how games would be created
   */
  async previewTemplate(id: number, gamedayId: number): Promise<TemplatePreview> {
    const response = await this.client.get<TemplatePreview>(
      `/templates/${id}/preview/`,
      {
        params: { gameday_id: gamedayId },
      }
    );
    return response.data;
  }

  /**
   * Get usage statistics for a template.
   *
   * @param id - Template ID
   * @returns Usage data showing which gamedays use this template
   */
  async getTemplateUsage(id: number): Promise<TemplateUsage> {
    const response = await this.client.get<TemplateUsage>(
      `/templates/${id}/usage/`
    );
    return response.data;
  }

  /**
   * Create a new team.
   *
   * @param name - Team name
   * @returns Created team with id and name
   */
  async createTeam(name: string): Promise<TeamRecord> {
    const response = await this.client.post<TeamRecord>(
      '/teams/',
      { name }
    );
    return response.data;
  }

  /**
   * Bulk-create teams.
   *
   * @param count - Number of teams to create
   * @returns Array of created teams with id and name
   */
  async createTeamsBulk(count: number): Promise<TeamRecord[]> {
    const response = await this.client.post<TeamRecord[]>(
      '/teams/bulk/',
      { count }
    );
    return response.data;
  }

  /**
   * List teams selectable for a gameday.
   *
   * @param options.allTeams - Bypass the gameday's own league restriction and
   * return every team. Used for external officials, who are typically not
   * part of the gameday's own league.
   */
  async getLeagueTeams(gamedayId: number, options?: { allTeams?: boolean }): Promise<TeamRecord[]> {
    const response = await this.client.get<TeamRecord[]>(
      `/gamedays/${gamedayId}/league-teams/`,
      { params: options?.allTeams ? { scope: 'all' } : undefined }
    );
    return response.data;
  }

  async getConfig(): Promise<DesignerConfig> {
    if (!this.configPromise) {
      this.configPromise = this.client.get<DesignerConfig>('/config/')
        .then(response => response.data)
        .catch(err => {
          this.configPromise = null;
          throw err;
        });
    }
    return this.configPromise;
  }

  /**
   * Persist the Swiss tournament setup for a gameday.
   *
   * @param gamedayId - Backend gameday PK
   * @param setup - Seed order (backend Team PKs, best first), rounds,
   * fields, game duration and optional per-round start-time overrides
   */
  async setupSwissTournament(
    gamedayId: number,
    setup: SwissSetupRequest,
  ): Promise<{ success: boolean; config: SwissTournamentConfig }> {
    const response = await this.client.post<{ success: boolean; config: SwissTournamentConfig }>(
      `/gamedays/${gamedayId}/swiss/setup/`,
      setup,
    );
    return response.data;
  }

  /**
   * Generate the next Swiss round (round 1 needs no prior results; later
   * rounds require every game of the previous round to be completed).
   *
   * @param gamedayId - Backend gameday PK
   * @param overrides - Optional edited pairings envelope (per-game field /
   * start_time plus bye_team_id) to materialize instead of the default draw
   */
  async generateSwissRound(
    gamedayId: number,
    overrides?: SwissGenerateOverrides,
  ): Promise<SwissGeneratedRound> {
    const response = await this.client.post<SwissGeneratedRound>(
      `/gamedays/${gamedayId}/swiss/generate-round/`,
      overrides ?? {},
    );
    return response.data;
  }

  /**
   * Preview the next Swiss round without materializing games.
   */
  async previewSwissRound(gamedayId: number): Promise<SwissRoundPreview> {
    const response = await this.client.post<SwissRoundPreview>(
      `/gamedays/${gamedayId}/swiss/generate-round/?dry_run=true`,
      {},
    );
    return response.data;
  }

  /**
   * Live Swiss standings table for a gameday.
   */
  async getSwissStandings(gamedayId: number): Promise<SwissStandings> {
    const response = await this.client.get<SwissStandings>(
      `/gamedays/${gamedayId}/swiss/standings/`,
    );
    return response.data;
  }
}

/**
 * Singleton instance of the API client.
 * Import and use this instance throughout the application.
 *
 * @example
 * ```typescript
 * import { designerApi } from './api/designerApi';
 *
 * const templates = await designerApi.listTemplates();
 * const template = await designerApi.getTemplate(1);
 * ```
 */
export const designerApi = new DesignerApi();
