/**
 * Tests for moveNodeToStage exposure via useFlowState (Issue #1921)
 *
 * The hook previously exposed a no-op placeholder; it must now perform
 * the real move and leave edges (bracket progression) intact.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlowState } from '../useFlowState';
import {
  createFieldNode,
  createStageNode,
  createGameNodeInStage,
  createGameToGameEdge,
} from '../../types/flowchart';
import type { FlowState, GameNode } from '../../types/flowchart';

describe('useFlowState - moveNodeToStage', () => {
  const buildState = (): FlowState => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const stage1 = createStageNode('stage-1', 'field-1', { name: 'Preliminary', order: 0 });
    const stage2 = createStageNode('stage-2', 'field-1', { name: 'Final', category: 'final', order: 1 });
    const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'HF1' });
    const gameB = createGameNodeInStage('game-b', 'stage-2', { standing: 'Final' });
    const edge = createGameToGameEdge('edge-1', 'game-a', 'winner', 'game-b', 'home');
    return {
      nodes: [field1, stage1, stage2, gameA, gameB],
      edges: [edge],
      globalTeams: [],
      globalTeamGroups: [],
    };
  };

  it('exposes a functioning moveNodeToStage (no placeholder no-op)', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState(buildState());
    });

    const gameBefore = result.current.nodes.find((n) => n.id === 'game-a');
    expect(gameBefore?.parentId).toBe('stage-1');

    act(() => {
      result.current.moveNodeToStage('game-a', 'stage-2');
    });

    const movedGame = result.current.nodes.find((n) => n.id === 'game-a') as GameNode;
    expect(movedGame.parentId).toBe('stage-2');
    expect(movedGame.data.stage).toBe('Final');
  });

  it('keeps bracket progression edges intact after a move', () => {
    const { result } = renderHook(() => useFlowState());
    const state = buildState();

    act(() => {
      result.current.importState(state);
    });

    act(() => {
      result.current.moveNodeToStage('game-a', 'stage-2');
    });

    expect(result.current.edges).toHaveLength(1);
    expect(result.current.edges[0].source).toBe('game-a');
    expect(result.current.edges[0].target).toBe('game-b');
  });

  it('triggers a save after a move', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState(buildState());
    });

    const saveTriggerBefore = result.current.saveTrigger;
    act(() => {
      result.current.moveNodeToStage('game-a', 'stage-2');
    });

    expect(result.current.saveTrigger).toBeGreaterThan(saveTriggerBefore);
  });
});
