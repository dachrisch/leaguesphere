/**
 * Tests for field-instance moves in useNodesState: `moveGameToField`,
 * `updateStageFields`, and `moveNodeToStage`'s `targetFieldId` param --
 * covering the "field is just where a game is played, never part of the
 * stage's identity" model (a multi-field stage renders once per field it
 * spans, see `StageNodeData.fieldIds` / `StageSection`'s `fieldContext`).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodesState } from '../useNodesState';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../types/flowchart';
import type { FlowNode, GameNode, StageNode } from '../../types/flowchart';

describe('useNodesState - field-instance moves', () => {
  const setupHook = (initialNodes: FlowNode[] = []) => {
    let nodes = initialNodes;
    const setNodes = vi.fn((update) => {
      nodes = typeof update === 'function' ? update(nodes) : update;
    });

    const { result, rerender } = renderHook(
      ({ nodes }) => useNodesState(nodes, setNodes),
      { initialProps: { nodes } }
    );

    return { result, setNodes, getNodes: () => nodes, rerender };
  };

  const buildMultiFieldStage = () => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Feld 2', order: 1 });
    const stage = createStageNode('stage-1', 'field-1', {
      name: 'Platzierung',
      category: 'placement',
      stageType: 'RANKING',
      order: 0,
      fieldIds: ['field-1', 'field-2'],
    });
    return { field1, field2, stage };
  };

  describe('moveGameToField', () => {
    it('assigns fieldId when moving to a non-home field', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameA]);
      rerender({ nodes: getNodes() });

      let moveResult = false;
      act(() => {
        moveResult = result.current.moveGameToField('game-a', 'field-2');
      });

      expect(moveResult).toBe(true);
      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.fieldId).toBe('field-2');
      // Stage/standing untouched -- only where it's played changed.
      expect(movedGame.parentId).toBe('stage-1');
    });

    it('clears fieldId when moving back to the stage\'s home field', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1', fieldId: 'field-2' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveGameToField('game-a', 'field-1');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.fieldId).toBeFalsy();
    });

    it('rejects moving to the field the game is already resolved to', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameA]);
      rerender({ nodes: getNodes() });
      const before = JSON.stringify(getNodes());

      let moveResult = true;
      act(() => {
        moveResult = result.current.moveGameToField('game-a', 'field-1');
      });

      expect(moveResult).toBe(false);
      expect(JSON.stringify(getNodes())).toBe(before);
    });

    it('rejects an unknown game id', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const { result, getNodes, rerender } = setupHook([field1, field2, stage]);
      rerender({ nodes: getNodes() });

      let moveResult = true;
      act(() => {
        moveResult = result.current.moveGameToField('does-not-exist', 'field-2');
      });

      expect(moveResult).toBe(false);
    });

    it('recalculates the stage\'s start times so it schedules in parallel across fields', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      stage.data.startTime = '10:00';
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const gameB = createGameNodeInStage('game-b', 'stage-1', { standing: 'B1' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameA, gameB]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveGameToField('game-b', 'field-2');
      });

      const byId = (id: string) => (getNodes().find((n) => n.id === id) as GameNode).data.startTime;
      // Both now run in parallel on separate fields from the stage's start.
      expect(byId('game-a')).toBe('10:00');
      expect(byId('game-b')).toBe('10:00');
    });
  });

  describe('moveNodeToStage with targetFieldId', () => {
    it('assigns the given field when it differs from the target stage\'s home field', () => {
      const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
      const field2 = createFieldNode('field-2', { name: 'Feld 2', order: 1 });
      const sourceStage = createStageNode('stage-1', 'field-1', { name: 'Source', order: 0 });
      const targetStage = createStageNode('stage-2', 'field-1', {
        name: 'Target',
        order: 1,
        fieldIds: ['field-1', 'field-2'],
      });
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, field2, sourceStage, targetStage, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2', 'field-2');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.parentId).toBe('stage-2');
      expect(movedGame.data.fieldId).toBe('field-2');
    });

    it('leaves fieldId unset when the given field is the target stage\'s home field', () => {
      const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
      const sourceStage = createStageNode('stage-1', 'field-1', { name: 'Source', order: 0 });
      const targetStage = createStageNode('stage-2', 'field-1', { name: 'Target', order: 1 });
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, sourceStage, targetStage, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2', 'field-1');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.fieldId).toBeFalsy();
    });
  });

  describe('updateStageFields', () => {
    it('sets the stage\'s fieldIds', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      stage.data.fieldIds = undefined;
      const { result, getNodes, rerender } = setupHook([field1, field2, stage]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.updateStageFields('stage-1', ['field-1', 'field-2']);
      });

      const updatedStage = getNodes().find((n) => n.id === 'stage-1') as StageNode;
      expect(updatedStage.data.fieldIds).toEqual(['field-1', 'field-2']);
    });

    it('strands no games -- resets fieldId back to the home field for games on a removed field', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameOnField2 = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1', fieldId: 'field-2' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameOnField2]);
      rerender({ nodes: getNodes() });

      act(() => {
        // field-2 dropped from the stage's fields.
        result.current.updateStageFields('stage-1', ['field-1']);
      });

      const nodes = getNodes();
      const updatedStage = nodes.find((n) => n.id === 'stage-1') as StageNode;
      const updatedGame = nodes.find((n) => n.id === 'game-a') as GameNode;
      expect(updatedStage.data.fieldIds).toEqual(['field-1']);
      expect(updatedGame.data.fieldId).toBeFalsy();
    });

    it('leaves games alone when their field is still in the new list', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameOnField2 = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1', fieldId: 'field-2' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameOnField2]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.updateStageFields('stage-1', ['field-1', 'field-2']);
      });

      const updatedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(updatedGame.data.fieldId).toBe('field-2');
    });

    it('clears fieldIds entirely (back to a single-field stage) without touching games', () => {
      const { field1, field2, stage } = buildMultiFieldStage();
      const gameOnField2 = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1', fieldId: 'field-2' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage, gameOnField2]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.updateStageFields('stage-1', undefined);
      });

      const nodes = getNodes();
      const updatedStage = nodes.find((n) => n.id === 'stage-1') as StageNode;
      const updatedGame = nodes.find((n) => n.id === 'game-a') as GameNode;
      expect(updatedStage.data.fieldIds).toBeUndefined();
      // An empty/undefined fieldIds list has nothing to strand against, so
      // existing per-game fieldIds are left as-is (harmless: with fieldIds
      // unset, the stage is back to a single logical field via parentId,
      // and any stale fieldId simply stops being read anywhere).
      expect(updatedGame.data.fieldId).toBe('field-2');
    });
  });
});
