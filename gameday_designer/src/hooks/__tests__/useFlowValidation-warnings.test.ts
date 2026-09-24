
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
  });

  describe('Duplicate Team Label Warnings', () => {
    const makeNodes = (homeTeamId: string | null, awayTeamId: string | null = null): FlowNode[] => [
      { id: 'f1', type: 'field', data: { name: 'F1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'S1', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', homeTeamId, awayTeamId } as GameNodeData, position: { x: 0, y: 0 } }
    ];

    it('should warn team_without_games for a unique unassigned team label', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-22', label: 'Lions', groupId: 'g1', order: 18 },
        { id: 'team-orphan', label: 'Fursty', groupId: null, order: 2 }
      ];
      const { result } = renderHook(() => useFlowValidation(makeNodes('team-22'), [], teams, [], validMetadata));

      const warnings = result.current.warnings.filter(w => w.type === 'team_without_games');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.messageKey).toBe('team_without_games');
      expect(warnings[0]?.messageParams?.team).toBe('Fursty');
      expect(result.current.warnings.find(w => w.type === 'duplicate_team_label')).toBeUndefined();
    });

    it('should warn duplicate_team_label when one entry of a duplicate label is assigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-22', label: 'Lions', groupId: 'g1', order: 18 },
        { id: 'team-orphan', label: 'Lions', groupId: null, order: 2 }
      ];
      const { result } = renderHook(() => useFlowValidation(makeNodes('team-22'), [], teams, [], validMetadata));

      const dup = result.current.warnings.filter(w => w.type === 'duplicate_team_label');
      expect(dup).toHaveLength(1);
      expect(dup[0]?.messageKey).toBe('duplicate_team_label');
      expect(dup[0]?.messageParams?.team).toBe('Lions');
      expect(dup[0]?.messageParams?.count).toBe(1);
      expect(dup[0]?.affectedNodes).toContain('team-orphan');
      // The orphan's generic warning must be replaced, not duplicated
      expect(result.current.warnings.filter(w => w.type === 'team_without_games')).toHaveLength(0);
    });

    it('should aggregate multiple orphans sharing a label into a single warning', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-22', label: 'Lions', groupId: 'g1', order: 18 },
        { id: 'team-orphan-1', label: 'Lions', groupId: null, order: 2 },
        { id: 'team-orphan-2', label: 'Lions', groupId: null, order: 3 }
      ];
      const { result } = renderHook(() => useFlowValidation(makeNodes('team-22'), [], teams, [], validMetadata));

      const dup = result.current.warnings.filter(w => w.type === 'duplicate_team_label');
      expect(dup).toHaveLength(1);
      expect(dup[0]?.messageParams?.team).toBe('Lions');
      expect(dup[0]?.messageParams?.count).toBe(2);
      expect(dup[0]?.messageParams?.unassignedCount).toBe(2);
      expect(dup[0]?.messageParams?.assignedCount).toBe(1);
      expect(dup[0]?.affectedNodes).toEqual(
        expect.arrayContaining(['team-orphan-1', 'team-orphan-2'])
      );
      expect(result.current.warnings.filter(w => w.type === 'team_without_games')).toHaveLength(0);
    });

    it('should not warn when all duplicate entries are assigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-a', label: 'Lions', groupId: 'g1', order: 0 },
        { id: 'team-b', label: 'Lions', groupId: 'g1', order: 1 }
      ];
      const { result } = renderHook(() => useFlowValidation(makeNodes('team-a', 'team-b'), [], teams, [], validMetadata));

      expect(result.current.warnings.filter(w => w.type === 'team_without_games')).toHaveLength(0);
      expect(result.current.warnings.filter(w => w.type === 'duplicate_team_label')).toHaveLength(0);
    });

    it('should warn two team_without_games when duplicate labels are both unassigned', () => {
      const teams: GlobalTeam[] = [
        { id: 'team-a', label: 'Lions', groupId: 'g1', order: 1 },
        { id: 'team-b', label: 'Lions', groupId: null, order: 2 },
        { id: 'team-c', label: 'Tigers', groupId: 'g1', order: 3 }
      ];
      const { result } = renderHook(() => useFlowValidation(makeNodes('team-c'), [], teams, [], validMetadata));

      const unassigned = result.current.warnings.filter(w => w.type === 'team_without_games');
      expect(unassigned).toHaveLength(2);
      expect(result.current.warnings.find(w => w.type === 'duplicate_team_label')).toBeUndefined();
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

  describe('Multi-field Stage Warning', () => {
    it('warns when a game is assigned to a field its stage no longer spans', () => {
      // g1 was placed on f2 while the stage still spanned both fields;
      // the stage was later edited down to just f1, stranding g1's fieldId.
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Platzierung', order: 0, fieldIds: ['f1'] } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', fieldId: 'f2', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

      const warning = result.current.warnings.find(w => w.affectedNodes.includes('g1') && w.type === 'unassigned_field');
      expect(warning).toBeDefined();
      expect(warning?.messageKey).toBe('unassigned_field_multi_field_stage');
    });

    it('does not warn when a game in a multi-field stage has no fieldId chosen (plays on the stage\'s home field)', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Platzierung', order: 0, fieldIds: ['f1', 'f2'] } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', fieldId: null, homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

      const warning = result.current.warnings.find(w => w.affectedNodes.includes('g1') && w.type === 'unassigned_field');
      expect(warning).toBeUndefined();
    });

    it('falls back to the node id in the message/params when the stranded game has no standing', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Platzierung', order: 0, fieldIds: ['f1'] } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: '', fieldId: 'f2', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

      const warning = result.current.warnings.find(w => w.affectedNodes.includes('g1') && w.type === 'unassigned_field');
      expect(warning?.message).toContain('"g1"');
      expect(warning?.messageParams?.game).toBe('g1');
    });

    it('does not warn when a game in a multi-field stage has picked a field', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Platzierung', order: 0, fieldIds: ['f1', 'f2'] } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', fieldId: 'f2', homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

      const warning = result.current.warnings.find(w => w.affectedNodes.includes('g1') && w.type === 'unassigned_field');
      expect(warning).toBeUndefined();
    });

    it('does not warn for a single-field stage (no fieldIds set)', () => {
      const nodes: FlowNode[] = [
        { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
        { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Vorrunde', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
        { id: 'g1', type: 'game', parentId: 's1', data: { standing: 'G1', fieldId: null, homeTeamId: 't1', awayTeamId: 't2' } as GameNodeData, position: { x: 0, y: 0 } },
      ];
      const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

      const warning = result.current.warnings.find(w => w.affectedNodes.includes('g1') && w.type === 'unassigned_field');
      expect(warning).toBeUndefined();
    });
  });
});
