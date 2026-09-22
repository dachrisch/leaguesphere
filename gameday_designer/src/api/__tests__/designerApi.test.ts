/**
 * Tests for Designer API Client
 *
 * Testing the API client methods that communicate with the Django backend.
 * Following TDD approach - these tests are written BEFORE implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ScheduleTemplate,
  PaginatedResponse,
  ValidationResult,
  ApplicationResult,
  ApplyTemplateRequest,
  CloneTemplateRequest,
} from '../../types';

// Use vi.hoisted to create mock before hoisted vi.mock call
const mockAxiosInstance = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn((callback: (config: unknown) => unknown) => callback) },
    response: { use: vi.fn((success: (response: unknown) => unknown, error: (error: unknown) => unknown) => ({ success, error })) },
  },
}));

// Mock axios module to always return our mock instance
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
  },
}));

// Import after mocking
import { designerApi } from '../designerApi';

describe('DesignerApi', () => {
  beforeEach(() => {
    // Clear all mock calls
    vi.clearAllMocks();

    // Clear localStorage
    localStorage.clear();
  });

  describe('listTemplates', () => {
    it('should fetch all templates without filters', async () => {
      const mockResponse: PaginatedResponse<ScheduleTemplate> = {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: 'Template 1',
            num_teams: 8,
            num_fields: 2,
            num_groups: 2,
            game_duration: 15,
            sharing: 'PRIVATE',
            association: null,
            created_by: null,
            updated_by: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Template 2',
            num_teams: 12,
            num_fields: 3,
            num_groups: 3,
            game_duration: 12,
            sharing: 'PRIVATE',
            association: null,
            created_by: null,
            updated_by: null,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.listTemplates();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/', {
        params: undefined,
      });
      expect(result).toEqual(mockResponse);
      expect(result.results).toHaveLength(2);
    });

    it('should fetch templates with association filter', async () => {
      const mockResponse: PaginatedResponse<ScheduleTemplate> = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: 'Template 1',
            num_teams: 8,
            num_fields: 2,
            num_groups: 2,
            game_duration: 15,
            sharing: 'PRIVATE',
            association: 5,
            created_by: null,
            updated_by: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.listTemplates({ association: 5 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/', {
        params: { association: 5 },
      });
      expect(result.results[0].association).toBe(5);
    });

    it('should fetch templates with search filter', async () => {
      const mockResponse: PaginatedResponse<ScheduleTemplate> = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: 'Standard Template',
            num_teams: 8,
            num_fields: 2,
            num_groups: 2,
            game_duration: 15,
            sharing: 'PRIVATE',
            association: null,
            created_by: null,
            updated_by: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse });

      await designerApi.listTemplates({ search: 'Standard' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/', {
        params: { search: 'Standard' },
      });
    });
  });

  describe('getTemplate', () => {
    it('should fetch a single template by ID', async () => {
      const mockTemplate: ScheduleTemplate = {
        id: 1,
        name: 'Template 1',
        num_teams: 8,
        num_fields: 2,
        num_groups: 2,
        game_duration: 15,
        sharing: 'PRIVATE',
        association: null,
        created_by: null,
        updated_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        slots: [],
        update_rules: [],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockTemplate });

      const result = await designerApi.getTemplate(1);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/1/');
      expect(result).toEqual(mockTemplate);
      expect(result.id).toBe(1);
      expect(result.slots).toBeDefined();
      expect(result.update_rules).toBeDefined();
    });

    it('should handle not found error', async () => {
      mockAxiosInstance.get.mockRejectedValue({
        response: { status: 404, data: { detail: 'Not found' } },
      });

      await expect(designerApi.getTemplate(999)).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const newTemplate = {
        name: 'New Template',
        num_teams: 10,
        num_fields: 2,
        num_groups: 2,
        game_duration: 12,
      };

      const mockResponse: ScheduleTemplate = {
        id: 3,
        ...newTemplate,
        sharing: 'PRIVATE',
        association: null,
        created_by: 1,
        updated_by: 1,
        created_at: '2024-01-03T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.createTemplate(newTemplate);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/templates/',
        newTemplate
      );
      expect(result.id).toBe(3);
      expect(result.name).toBe('New Template');
    });

    it('should handle validation errors', async () => {
      mockAxiosInstance.post.mockRejectedValue({
        response: {
          status: 400,
          data: { name: ['This field is required.'] },
        },
      });

      await expect(
        designerApi.createTemplate({ name: '' } as Parameters<typeof designerApi.createTemplate>[0])
      ).rejects.toMatchObject({
        response: { status: 400 },
      });
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template with PUT', async () => {
      const updatedData = {
        name: 'Updated Template',
        num_teams: 12,
        num_fields: 3,
        num_groups: 3,
        game_duration: 10,
      };

      const mockResponse: ScheduleTemplate = {
        id: 1,
        ...updatedData,
        sharing: 'PRIVATE',
        association: null,
        created_by: 1,
        updated_by: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-04T00:00:00Z',
      };

      mockAxiosInstance.put.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.updateTemplate(1, updatedData);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/templates/1/',
        updatedData
      );
      expect(result.name).toBe('Updated Template');
      expect(result.updated_at).toBe('2024-01-04T00:00:00Z');
    });
  });

  describe('patchTemplate', () => {
    it('should partially update a template with PATCH', async () => {
      const patchData = { name: 'Patched Name' };

      const mockResponse: ScheduleTemplate = {
        id: 1,
        name: 'Patched Name',
        num_teams: 8,
        num_fields: 2,
        num_groups: 2,
        game_duration: 15,
        sharing: 'PRIVATE',
        association: null,
        created_by: 1,
        updated_by: 2,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-05T00:00:00Z',
      };

      mockAxiosInstance.patch.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.patchTemplate(1, patchData);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/templates/1/',
        patchData
      );
      expect(result.name).toBe('Patched Name');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: null });

      await designerApi.deleteTemplate(1);

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/templates/1/');
    });

    it('should handle deletion errors', async () => {
      mockAxiosInstance.delete.mockRejectedValue({
        response: {
          status: 403,
          data: { detail: 'Permission denied' },
        },
      });

      await expect(designerApi.deleteTemplate(1)).rejects.toMatchObject({
        response: { status: 403 },
      });
    });
  });

  describe('validateTemplate', () => {
    it('should validate a template and return validation result', async () => {
      const mockValidation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockValidation });

      const result = await designerApi.validateTemplate(1);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/templates/1/validate/'
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return validation errors', async () => {
      const mockValidation: ValidationResult = {
        isValid: false,
        errors: [
          {
            id: 'err-1',
            type: 'invalid_reference',
            message: 'Invalid team reference',
            affectedSlots: [],
          },
        ],
        warnings: [],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockValidation });

      const result = await designerApi.validateTemplate(1);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid_reference');
    });
  });

  describe('applyTemplate', () => {
    it('should apply a template to a gameday', async () => {
      const applyRequest: ApplyTemplateRequest = {
        gameday_id: 10,
        team_mapping: {
          '0_0': 1,
          '0_1': 2,
          '1_0': 3,
          '1_1': 4,
        },
      };

      const mockResult: ApplicationResult = {
        success: true,
        gameday_id: 10,
        gameinfos_created: 12,
        gameresults_created: 12,
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResult });

      const result = await designerApi.applyTemplate(1, applyRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/templates/1/apply/',
        applyRequest
      );
      expect(result.success).toBe(true);
      expect(result.gameinfos_created).toBe(12);
    });

    it('should handle application errors', async () => {
      const applyRequest: ApplyTemplateRequest = {
        gameday_id: 10,
        team_mapping: {},
      };

      const mockResult: ApplicationResult = {
        success: false,
        errors: ['Team mapping incomplete', 'Missing team for 0_0'],
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResult });

      const result = await designerApi.applyTemplate(1, applyRequest);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone a template with new name', async () => {
      const cloneRequest: CloneTemplateRequest = {
        new_name: 'Cloned Template',
      };

      const mockResponse: ScheduleTemplate = {
        id: 5,
        name: 'Cloned Template',
        num_teams: 8,
        num_fields: 2,
        num_groups: 2,
        game_duration: 15,
        sharing: 'PRIVATE',
        association: null,
        created_by: 1,
        updated_by: 1,
        created_at: '2024-01-06T00:00:00Z',
        updated_at: '2024-01-06T00:00:00Z',
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await designerApi.cloneTemplate(1, cloneRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/templates/1/clone/',
        cloneRequest
      );
      expect(result.id).toBe(5);
      expect(result.name).toBe('Cloned Template');
    });

  });

  describe('previewTemplate', () => {
    it('should preview template application', async () => {
      const mockPreview = {
        games: [
          {
            field: 1,
            slot_order: 1,
            stage: 'Preliminary',
            standing: 'Gruppe 1',
            home_team: 'Team A',
            away_team: 'Team B',
            officials_team: 'Team C',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockPreview });

      const result = await designerApi.previewTemplate(1, 10);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/templates/1/preview/',
        {
          params: { gameday_id: 10 },
        }
      );
      expect(result.games).toHaveLength(1);
    });
  });

  describe('getTemplateUsage', () => {
    it('should get template usage statistics', async () => {
      const mockUsage = {
        template_id: 1,
        template_name: 'Standard Template',
        gamedays: [
          { id: 1, date: '2024-01-15', association_name: 'League A' },
          { id: 2, date: '2024-01-22', association_name: 'League A' },
        ],
        usage_count: 2,
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockUsage });

      const result = await designerApi.getTemplateUsage(1);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/templates/1/usage/'
      );
      expect(result.usage_count).toBe(2);
      expect(result.gamedays).toHaveLength(2);
    });
  });

  describe('getLeagueTeams', () => {
    it('should fetch teams scoped to the gameday league by default', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [{ id: 1, name: 'Team A' }] });

      const result = await designerApi.getLeagueTeams(42);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/gamedays/42/league-teams/',
        { params: undefined }
      );
      expect(result).toEqual([{ id: 1, name: 'Team A' }]);
    });

    it('should request scope=all when allTeams is true', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await designerApi.getLeagueTeams(42, { allTeams: true });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/gamedays/42/league-teams/',
        { params: { scope: 'all' } }
      );
    });

    it('should not request scope=all when allTeams is false', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      await designerApi.getLeagueTeams(42, { allTeams: false });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/gamedays/42/league-teams/',
        { params: undefined }
      );
    });
  });

  describe('setupSwissTournament', () => {
    it('should post the swiss setup for a gameday', async () => {
      const setup = {
        seed_team_ids: [11, 22, 33, 44],
        rounds: 3,
        fields: 2,
        game_duration: 30,
      };
      const config = {
        seedOrder: [11, 22, 33, 44],
        rounds: 3,
        fields: 2,
        gameDuration: 30,
        roundStartTimes: { '1': '09:00', '2': '10:20', '3': '11:40' },
        completedRounds: [],
        byes: {},
      };
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true, config } });

      const result = await designerApi.setupSwissTournament(42, setup);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/setup/',
        setup,
      );
      expect(result).toEqual({ success: true, config });
    });
  });

  describe('generateSwissRound', () => {
    it('should post a round-generation request and return pairings', async () => {
      const generated = {
        success: true,
        round: 1,
        pairings: [{ home_team_id: 11, away_team_id: 33 }],
        bye_team_id: null,
        game_ids: [101],
      };
      mockAxiosInstance.post.mockResolvedValue({ data: generated });

      const result = await designerApi.generateSwissRound(42);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/generate-round/',
        {},
      );
      expect(result).toEqual(generated);
    });

    it('should post the overrides envelope as body when provided', async () => {
      const overrides = {
        pairings: [
          { home_team_id: 11, away_team_id: 22, field: 2, start_time: '10:20' },
          { home_team_id: 33, away_team_id: 44 },
        ],
        bye_team_id: 55,
      };
      const generated = {
        success: true,
        round: 2,
        pairings: [
          { home_team_id: 11, away_team_id: 22 },
          { home_team_id: 33, away_team_id: 44 },
        ],
        bye_team_id: 55,
        game_ids: [201, 202],
      };
      mockAxiosInstance.post.mockResolvedValue({ data: generated });

      const result = await designerApi.generateSwissRound(42, overrides);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/generate-round/',
        overrides,
      );
      expect(result).toEqual(generated);
    });
  });

  describe('previewSwissRound', () => {
    it('should post a dry_run request and resolve the preview shape', async () => {
      const preview = {
        success: true,
        round: 2,
        pairings: [{ home_team_id: 11, away_team_id: 22 }],
        bye_team_id: 33,
        game_ids: [],
      };
      mockAxiosInstance.post.mockResolvedValue({ data: preview });

      const result = await designerApi.previewSwissRound(42);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/generate-round/?dry_run=true',
        {},
      );
      expect(result).toEqual(preview);
    });
  });

  describe('getSwissStandings', () => {
    it('should fetch the standings table for a gameday', async () => {
      const standings = {
        standings: [
          {
            team_id: 11, team_name: 'A', seed: 0, played: 1, wins: 1,
            draws: 0, losses: 0, points_for: 10, points_against: 5,
            byes: 0, points: 2,
          },
        ],
        rounds_completed: 1,
        rounds_total: 3,
      };
      mockAxiosInstance.get.mockResolvedValue({ data: standings });

      const result = await designerApi.getSwissStandings(42);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/gamedays/42/swiss/standings/',
      );
      expect(result).toEqual(standings);
    });
  });

  describe('resetSwissTournament', () => {
    it('should post the swiss reset for a gameday and return the deleted count', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true, deleted_games: 4 } });

      const result = await designerApi.resetSwissTournament(42);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/reset/',
        {},
      );
      expect(result).toEqual({ success: true, deleted_games: 4 });
    });
  });

  describe('updateSwissRoundTimes', () => {
    it('should post round start overrides and return the updated plan', async () => {
      const roundStartTimes = { '1': '09:00', '2': '10:30', '3': '11:40' };
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true, roundStartTimes } });

      const result = await designerApi.updateSwissRoundTimes(42, { '2': '10:30' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/gamedays/42/swiss/round-times/',
        { round_start_overrides: { '2': '10:30' } },
      );
      expect(result).toEqual({ success: true, roundStartTimes });
    });
  });
});
