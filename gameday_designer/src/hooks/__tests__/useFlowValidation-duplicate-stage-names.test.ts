import { renderHook } from '@testing-library/react';
import { useFlowValidation } from '../useFlowValidation';
import type { FlowNode, FieldNodeData, StageNodeData } from '../../types/flowchart';
import { describe, it, expect } from 'vitest';

const validMetadata = { id: 1, name: 'Test', date: '2026-01-01', start: '10:00', status: 'DRAFT', format: '6_2', author: 1, address: 'Field', season: 1, league: 1 };

describe('useFlowValidation - checkDuplicateStageNames', () => {
  it('errors when two different stages across different fields share a name (case-insensitive, whitespace-insensitive)', () => {
    const nodes: FlowNode[] = [
      { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Preliminary', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 's2', type: 'stage', parentId: 'f2', data: { name: '  preliminary  ', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
    ];
    const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

    const error = result.current.errors.find((e) => e.type === 'duplicate_stage_name');
    expect(error).toBeDefined();
    expect(error?.messageKey).toBe('duplicate_stage_name');
    expect(error?.affectedNodes.sort()).toEqual(['s1', 's2']);
    expect(error?.messageParams).toEqual({ name: 'Preliminary', count: 2 });
  });

  it('reports one error with every id when 3+ stages share a name', () => {
    const nodes: FlowNode[] = [
      { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Gruppe A', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 's2', type: 'stage', parentId: 'f1', data: { name: 'Gruppe A', order: 1 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 's3', type: 'stage', parentId: 'f1', data: { name: 'Gruppe A', order: 2 } as StageNodeData, position: { x: 0, y: 0 } },
    ];
    const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

    const errors = result.current.errors.filter((e) => e.type === 'duplicate_stage_name');
    expect(errors).toHaveLength(1);
    expect(errors[0].affectedNodes.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('does not error for uniquely named stages, including a single stage node spanning multiple fields (fieldIds)', () => {
    const nodes: FlowNode[] = [
      { id: 'f1', type: 'field', data: { name: 'Feld 1', order: 0 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 'f2', type: 'field', data: { name: 'Feld 2', order: 1 } as FieldNodeData, position: { x: 0, y: 0 } },
      { id: 's1', type: 'stage', parentId: 'f1', data: { name: 'Vorrunde', order: 0 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 's2', type: 'stage', parentId: 'f1', data: { name: 'Finalrunde', order: 1 } as StageNodeData, position: { x: 0, y: 0 } },
      { id: 's3', type: 'stage', parentId: 'f1', data: { name: 'Platzierung', order: 2, fieldIds: ['f1', 'f2'] } as StageNodeData, position: { x: 0, y: 0 } },
    ];
    const { result } = renderHook(() => useFlowValidation(nodes, [], [], [], validMetadata));

    expect(result.current.errors.find((e) => e.type === 'duplicate_stage_name')).toBeUndefined();
  });
});
