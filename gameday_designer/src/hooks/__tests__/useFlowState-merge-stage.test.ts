/**
 * Tests for `mergeStageInto` and the `updateNode` rename-collision override
 * in `useFlowState.ts`.
 *
 * Stage NAME is a stage's identity: renaming a stage to match another
 * existing stage's name merges them (games, fields, and references fold
 * into the target; the source node is deleted) rather than creating a
 * same-named duplicate.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlowState } from '../useFlowState';
import {
  createFieldNode,
  createStageNode,
  createGameNodeInStage,
  getStageFieldIds,
} from '../../types/flowchart';
import type { FlowState, GameNode, StageNode } from '../../types/flowchart';

describe('useFlowState - mergeStageInto', () => {
  const buildState = (): FlowState => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Feld 2', order: 1 });
    const field3 = createFieldNode('field-3', { name: 'Feld 3', order: 2 });
    const target = createStageNode('stage-target', 'field-1', { name: 'Vorrunde A', order: 0 });
    const source = createStageNode('stage-source', 'field-2', {
      name: 'Vorrunde B',
      order: 0,
      fieldIds: ['field-2', 'field-3'],
    });
    const finalStage = createStageNode('stage-final', 'field-1', { name: 'Endspiel', order: 1 });

    const gameTarget = createGameNodeInStage('game-target', 'stage-target', { standing: 'GA1' });
    const gameSource = createGameNodeInStage('game-source', 'stage-source', {
      standing: 'GB1',
      official: { type: 'rank', place: 1, stageId: 'stage-source', stageName: 'Vorrunde B' },
    });
    const gameFinal = createGameNodeInStage('game-final', 'stage-final', { standing: 'Finale' });

    return {
      nodes: [field1, field2, field3, target, source, finalStage, gameTarget, gameSource, gameFinal],
      edges: [],
      globalTeams: [],
      globalTeamGroups: [],
    };
  };

  it('re-parents the source stage\'s games onto the target and preserves their actual field', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    const movedGame = result.current.nodes.find((n) => n.id === 'game-source') as GameNode;
    expect(movedGame.parentId).toBe('stage-target');
    expect(movedGame.data.stage).toBe('Vorrunde A');
    // The source stage's home field differs from the target's -- the game
    // must keep playing where it always did, not silently move to the
    // target's field.
    expect(movedGame.data.fieldId).toBe('field-2');
  });

  it('unions fieldIds from both stages onto the target', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    const target = result.current.nodes.find((n) => n.id === 'stage-target') as StageNode;
    expect(getStageFieldIds(target)).toEqual(['field-1', 'field-2', 'field-3']);
  });

  it('deletes the source stage node', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    expect(result.current.nodes.find((n) => n.id === 'stage-source')).toBeUndefined();
  });

  it('keeps the target\'s own name and stageType, discarding the source\'s', () => {
    const { result } = renderHook(() => useFlowState());
    const state = buildState();
    const source = state.nodes.find((n) => n.id === 'stage-source') as StageNode;
    source.data.stageType = 'RANKING';
    act(() => { result.current.importState(state); });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    const target = result.current.nodes.find((n) => n.id === 'stage-target') as StageNode;
    expect(target.data.name).toBe('Vorrunde A');
    expect(target.data.stageType).toBe('STANDARD');
  });

  it('repoints an official reference to the source stage, on an unrelated game, at the target', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    const movedGame = result.current.nodes.find((n) => n.id === 'game-source') as GameNode;
    expect(movedGame.data.official).toEqual({ type: 'rank', place: 1, stageId: 'stage-target', stageName: 'Vorrunde A' });
  });

  it('repoints a rank reference wired via a stageToGame edge at the target', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => {
      result.current.addStageToGameEdge('stage-source', 1, 'game-final', 'home');
    });

    act(() => { result.current.mergeStageInto('stage-source', 'stage-target'); });

    const finalGame = result.current.nodes.find((n) => n.id === 'game-final') as GameNode;
    expect(finalGame.data.homeTeamDynamic).toEqual(
      expect.objectContaining({ type: 'rank', place: 1, stageId: 'stage-target', stageName: 'Vorrunde A' })
    );
    const remappedEdge = result.current.edges.find((e) => e.target === 'game-final' && e.targetHandle === 'home');
    expect(remappedEdge?.source).toBe('stage-target');
  });

  it('rejects merging a stage into itself', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    let success = true;
    act(() => { success = result.current.mergeStageInto('stage-target', 'stage-target'); });

    expect(success).toBe(false);
  });
});

describe('useFlowState - updateNode rename-collision override', () => {
  const buildState = (): FlowState => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const stageA = createStageNode('stage-a', 'field-1', { name: 'Vorrunde A', order: 0 });
    const stageB = createStageNode('stage-b', 'field-1', { name: 'Vorrunde B', order: 1 });
    const gameB = createGameNodeInStage('game-b', 'stage-b', { standing: 'GB1' });
    return { nodes: [field1, stageA, stageB, gameB], edges: [], globalTeams: [], globalTeamGroups: [] };
  };

  it('merges instead of renaming when the new name collides (case/whitespace-insensitive)', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.updateNode('stage-b', { name: '  vorrunde a  ' }); });

    const stages = result.current.nodes.filter((n) => n.type === 'stage');
    expect(stages).toHaveLength(1);
    expect((stages[0] as StageNode).data.name).toBe('Vorrunde A');
    const movedGame = result.current.nodes.find((n) => n.id === 'game-b') as GameNode;
    expect(movedGame.parentId).toBe('stage-a');
  });

  it('renames normally when the new name does not collide', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.updateNode('stage-b', { name: 'Platzierung' }); });

    const stageB = result.current.nodes.find((n) => n.id === 'stage-b') as StageNode;
    expect(stageB.data.name).toBe('Platzierung');
    expect(result.current.nodes.filter((n) => n.type === 'stage')).toHaveLength(2);
  });

  it('leaves a non-stage node update completely unaffected', () => {
    const { result } = renderHook(() => useFlowState());
    act(() => { result.current.importState(buildState()); });

    act(() => { result.current.updateNode('game-b', { standing: 'Vorrunde A' } as never); });

    const gameB = result.current.nodes.find((n) => n.id === 'game-b') as GameNode;
    expect(gameB.data.standing).toBe('Vorrunde A');
    expect(result.current.nodes.filter((n) => n.type === 'stage')).toHaveLength(2);
  });
});
