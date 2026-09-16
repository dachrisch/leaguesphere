
import { renderHook } from '@testing-library/react';
import { useFlowValidation } from '../useFlowValidation';
import type { FlowNode, GlobalTeam, FieldNodeData, StageNodeData, GameNodeData } from '../../types/flowchart';
import { describe, it, expect } from 'vitest';

const validMetadata = { id: 1, name: 'Test', date: '2026-01-01', start: '10:00', status: 'DRAFT', format: '6_2', author: 1, address: 'Field', season: 1, league: 1 };

describe('useFlowValidation - New Warnings', () => {
  describe('No Teams Warning', () => {
    it('should warn when global team pool is empty', () => {
      const { result } = renderHook(() => useFlowValidation([], [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'no_teams');
      expect(warning).toBeDefined();
      expect(warning?.messageKey).toBe('no_teams');
    });

    it('should not warn when global team pool has teams', () => {
      const teams: GlobalTeam[] = [{ id: 't1', label: 'Team 1', groupId: 'g1', order: 0 }];
      const { result } = renderHook(() => useFlowValidation([], [], teams, [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'no_teams');
      expect(warning).toBeUndefined();
    });
  });

  describe('No Games Warning', () => {
    it('should warn when there are no games in the schedule', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Field 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Stage 1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'no_games');
      expect(warning).toBeDefined();
      expect(warning?.messageKey).toBe('no_games');
    });

    it('should not warn when there is at least one game', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Field 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Stage 1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'no_games');
      expect(warning).toBeUndefined();
    });
  });

  describe('Teams without Games Warning', () => {
    it('should warn when a team in the pool is not assigned to any game', () => {
      const teams: GlobalTeam[] = [
        { id: 't1', label: 'Team 1', groupId: 'g1', order: 0 },
        { id: 't2', label: 'Team 2', groupId: 'g1', order: 1 }
      ];
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 't1', awayTeamId: null } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      // t2 is not assigned
      const { result } = renderHook(() => useFlowValidation(nodes, [], teams, [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'team_without_games');
      expect(warning).toBeDefined();
      expect(warning?.messageParams?.team).toBe('Team 2');
    });

    it('should not warn when all teams are assigned', () => {
      const teams: GlobalTeam[] = [{ id: 't1', label: 'Team 1', groupId: 'g1', order: 0 }];
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], teams, [], validMetadata));

      const warning = result.current.warnings.find(w => w.type === 'team_without_games');
      expect(warning).toBeUndefined();
    });

    it('should emit duplicate_team_label when one of two same-labeled entries is assigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-22', label: 'Lions', groupId: 'g1', order: 18 },
        { id: 'team-orphan', label: 'Lions', groupId: null, order: 2 },
        { id: 'team-9', label: 'Ingol', groupId: 'g1', order: 19 }
      ];
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'AF 2', homeTeamId: 'team-22', awayTeamId: 'team-9' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], teams, [], validMetadata));

      const duplicates = result.current.warnings.filter(w => w.type === 'duplicate_team_label');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].messageKey).toBe('duplicate_team_label');
      expect(duplicates[0].messageParams?.team).toBe('Lions');
      expect(duplicates[0].affectedNodes).toContain('team-orphan');
      // Neither Lions entry gets the generic warning
      expect(result.current.warnings.filter(w => w.type === 'team_without_games')).toHaveLength(0);
    });

    it('should keep two team_without_games warnings when duplicate labels are both unassigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-a', label: 'Lions', groupId: 'g1', order: 0 },
        { id: 'team-b', label: 'Lions', groupId: null, order: 1 }
      ];
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 'team-x', awayTeamId: 'team-y' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], teams, [], validMetadata));

      const generic = result.current.warnings.filter(w => w.type === 'team_without_games');
      expect(generic).toHaveLength(2);
      expect(result.current.warnings.filter(w => w.type === 'duplicate_team_label')).toHaveLength(0);
    });

    it('should not warn when all duplicate entries are assigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-a', label: 'Lions', groupId: 'g1', order: 0 },
        { id: 'team-b', label: 'Lions', groupId: 'g1', order: 1 }
      ];
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 'team-a', awayTeamId: 'team-b' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], teams, [], validMetadata));

      expect(result.current.warnings.filter(w => w.type === 'team_without_games')).toHaveLength(0);
      expect(result.current.warnings.filter(w => w.type === 'duplicate_team_label')).toHaveLength(0);
    });
  });

  describe('Unused Fields Warning', () => {
    it('should warn when a field has no games but another field does', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Field 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Field 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Stage 1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      // f1 has games, f2 does not
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'unused_field');
      expect(warning).toBeDefined();
      expect(warning?.messageParams?.field).toBe('Field 2');
    });

    it('should not warn if the entire schedule is empty', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Field 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Field 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'unused_field');
      expect(warning).toBeUndefined();
    });
  });

  describe('Broken Dynamic Progressions Warning', () => {
    it('should warn when a game references a non-existent standing', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamDynamic: { type: 'winner', matchName: 'NonExistent' }, awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'broken_progression');
      expect(warning).toBeDefined();
      expect(warning?.messageParams?.target).toBe('NonExistent');
    });

    it('should not warn for valid dynamic references', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
        { id: 'g2', type: 'game', parentId: 's1', data: { standing: 'G2', homeTeamDynamic: { type: 'winner', matchName: 'G1' }, awayTeamId: 't3' } as GameNodeData, position: { x: 0, y: 0 } }
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));
      
      const warning = result.current.warnings.find(w => w.type === 'broken_progression');
      expect(warning).toBeUndefined();
    });
  });
});
