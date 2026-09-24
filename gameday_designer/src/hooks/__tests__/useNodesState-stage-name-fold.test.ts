/**
 * Tests for the create-time stage-name fold-in in `addStageNode`.
 *
 * Stage NAME is a stage's identity (see `useFlowState.ts::mergeStageInto`):
 * two fields' first "Add Stage" click both default to "Preliminary" with no
 * typing at all, so this is the single most common way two same-named
 * stages could otherwise be created. `addStageNode` must fold a colliding
 * name into the existing stage (adding the new field to its `fieldIds`)
 * instead of creating a second node.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodesState } from '../useNodesState';
import { isStageNode, getStageFieldIds } from '../../types/flowchart';
import type { FlowNode, StageNode } from '../../types/flowchart';

describe('useNodesState - addStageNode name-collision fold-in', () => {
  const setupHook = (initialNodes: FlowNode[] = []) => {
    let nodes = initialNodes;
    const setNodes = vi.fn((update) => {
      nodes = typeof update === 'function' ? update(nodes) : update;
    });

    const { result, rerender } = renderHook(
      ({ nodes }) => useNodesState(nodes, setNodes),
      { initialProps: { nodes } }
    );

    return { result, getNodes: () => nodes, rerender };
  };

  it('folds a second field\'s first stage into the first field\'s same-named default stage', () => {
    const { result, getNodes, rerender } = setupHook();

    let field1Id = '';
    let field2Id = '';
    act(() => { field1Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });
    act(() => { field2Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });

    act(() => { result.current.addStageNode(field1Id); }); // defaults to "Preliminary"
    rerender({ nodes: getNodes() });
    act(() => { result.current.addStageNode(field2Id); }); // also defaults to "Preliminary"

    const stages = getNodes().filter(isStageNode);
    expect(stages).toHaveLength(1);
    expect(getStageFieldIds(stages[0] as StageNode)).toEqual([field1Id, field2Id]);
  });

  it('folds an explicitly typed matching name (case-insensitive, trimmed)', () => {
    const { result, getNodes, rerender } = setupHook();

    let field1Id = '';
    let field2Id = '';
    act(() => { field1Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });
    act(() => { field2Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });

    act(() => { result.current.addStageNode(field1Id, { name: 'Platzierung' }); });
    rerender({ nodes: getNodes() });
    act(() => { result.current.addStageNode(field2Id, { name: '  platzierung  ' }); });

    const stages = getNodes().filter(isStageNode);
    expect(stages).toHaveLength(1);
    expect(stages[0].data.name).toBe('Platzierung');
    expect(getStageFieldIds(stages[0] as StageNode)).toEqual([field1Id, field2Id]);
  });

  it('returns the existing stage, not a new node, on a fold-in', () => {
    const { result, getNodes, rerender } = setupHook();

    let field1Id = '';
    let field2Id = '';
    act(() => { field1Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });
    act(() => { field2Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });

    let firstStageId = '';
    act(() => { firstStageId = result.current.addStageNode(field1Id)!.id; });
    rerender({ nodes: getNodes() });

    let returned: StageNode | null = null;
    act(() => { returned = result.current.addStageNode(field2Id); });

    expect(returned!.id).toBe(firstStageId);
  });

  it('does not create a duplicate entry when re-adding the same field (idempotent)', () => {
    const { result, getNodes, rerender } = setupHook();

    let field1Id = '';
    let field2Id = '';
    act(() => { field1Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });
    act(() => { field2Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });

    act(() => { result.current.addStageNode(field1Id); });
    rerender({ nodes: getNodes() });
    act(() => { result.current.addStageNode(field2Id); });
    rerender({ nodes: getNodes() });
    act(() => { result.current.addStageNode(field2Id); }); // clicking "Add Stage" on field 2 again

    const stages = getNodes().filter(isStageNode);
    expect(stages).toHaveLength(1);
    expect(getStageFieldIds(stages[0] as StageNode)).toEqual([field1Id, field2Id]);
  });

  it('still creates a genuinely new stage when the name does not collide', () => {
    const { result, getNodes, rerender } = setupHook();

    let field1Id = '';
    act(() => { field1Id = result.current.addFieldNode().id; });
    rerender({ nodes: getNodes() });

    act(() => { result.current.addStageNode(field1Id, { name: 'Vorrunde' }); });
    rerender({ nodes: getNodes() });
    act(() => { result.current.addStageNode(field1Id, { name: 'Finalrunde' }); });

    const stages = getNodes().filter(isStageNode);
    expect(stages).toHaveLength(2);
  });
});
