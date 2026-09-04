/**
 * Tests for moveNodeToStage in useNodesState (Issue #1921)
 *
 * Covers moving games between stages (including across fields) with
 * conflict handling and consistent dependent state.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodesState } from '../useNodesState';
import {
  createFieldNode,
  createStageNode,
  createGameNodeInStage,
  isGameNode,
  isStageNode,
} from '../../types/flowchart';
import type { FlowNode, GameNode, StageNode } from '../../types/flowchart';

describe('useNodesState - moveNodeToStage', () => {
  const setupHook = (initialNodes: FlowNode[] = []) => {
    let nodes = initialNodes;
    const setNodes = vi.fn((update) => {
      if (typeof update === 'function') {
        nodes = update(nodes);
      } else {
        nodes = update;
      }
    });

    const { result, rerender } = renderHook(
      ({ nodes }) => useNodesState(nodes, setNodes),
      { initialProps: { nodes } }
    );

    return { result, setNodes, getNodes: () => nodes, rerender };
  };

  const buildStructure = () => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Feld 2', order: 1 });
    const stage1 = createStageNode('stage-1', 'field-1', {
      name: 'Preliminary',
      category: 'preliminary',
      stageType: 'STANDARD',
      order: 0,
    });
    const stage2 = createStageNode('stage-2', 'field-1', {
      name: 'Final',
      category: 'final',
      stageType: 'STANDARD',
      order: 1,
    });
    const stage3 = createStageNode('stage-3', 'field-2', {
      name: 'Placement',
      category: 'placement',
      stageType: 'RANKING',
      order: 0,
    });
    return { field1, field2, stage1, stage2, stage3 };
  };

  describe('basic moves', () => {
    it('moves a game to another stage within the same field', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1', stage: 'Preliminary' });
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2, gameA]);
      rerender({ nodes: getNodes() });

      let moveResult = false;
      act(() => {
        moveResult = result.current.moveNodeToStage('game-a', 'stage-2');
      });

      expect(moveResult).toBe(true);
      const nodes = getNodes();
      const movedGame = nodes.find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.parentId).toBe('stage-2');
      expect(movedGame.data.stage).toBe('Final');
    });

    it('syncs the stage type from the target stage', () => {
      const { field1, field2, stage1, stage3 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', {
        standing: 'A1',
        stage: 'Preliminary',
        stageType: 'STANDARD',
      });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage1, stage3, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-3');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.stage).toBe('Placement');
      expect(movedGame.data.stageType).toBe('RANKING');
    });

    it('moves a game to a stage in another field', () => {
      const { field1, field2, stage1, stage3 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, field2, stage1, stage3, gameA]);
      rerender({ nodes: getNodes() });

      let moveResult = false;
      act(() => {
        moveResult = result.current.moveNodeToStage('game-a', 'stage-3');
      });

      expect(moveResult).toBe(true);
      const nodes = getNodes();
      const movedGame = nodes.find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.parentId).toBe('stage-3');
      const targetStage = nodes.find((n) => n.id === 'stage-3') as StageNode;
      expect(targetStage.parentId).toBe('field-2');
    });

    it('appends the moved game after the last game of the target stage', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const gameB1 = createGameNodeInStage('game-b1', 'stage-2', { standing: 'B1' });
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2, gameA, gameB1]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2');
      });

      const ids = getNodes().map((n) => n.id);
      expect(ids).toEqual(['field-1', 'stage-1', 'stage-2', 'game-b1', 'game-a']);
    });

    it('positions the moved game below existing games in the target stage', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const gameB1 = createGameNodeInStage('game-b1', 'stage-2', { standing: 'B1' });
      const gameB2 = createGameNodeInStage('game-b2', 'stage-2', { standing: 'B2' });
      const { result, getNodes, rerender } = setupHook([
        field1, stage1, stage2, gameA, gameB1, gameB2,
      ]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.position).toEqual({ x: 30, y: 50 + 2 * 120 });
    });
  });

  describe('time recalculation (conflict handling)', () => {
    it('recalculates start times in both affected stages', () => {
      const { field1, stage1, stage2 } = buildStructure();
      stage1.data.startTime = '10:00';
      stage2.data.startTime = '12:00';
      const gameA1 = createGameNodeInStage('game-a1', 'stage-1', { standing: 'A1' });
      const gameA2 = createGameNodeInStage('game-a2', 'stage-1', { standing: 'A2' });
      const gameB1 = createGameNodeInStage('game-b1', 'stage-2', { standing: 'B1' });
      const { result, getNodes, rerender } = setupHook([
        field1, stage1, stage2, gameA1, gameA2, gameB1,
      ]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a2', 'stage-2');
      });

      const nodes = getNodes();
      const byId = (id: string) => (nodes.find((n) => n.id === id) as GameNode).data.startTime;
      // Target stage: B1 stays at 12:00, moved A2 follows after B1's 70 min duration
      expect(byId('game-b1')).toBe('12:00');
      expect(byId('game-a2')).toBe('13:10');
      // Source stage: A1 remains first game at stage start
      expect(byId('game-a1')).toBe('10:00');
    });

    it('keeps manually set start times unchanged', () => {
      const { field1, stage1, stage2 } = buildStructure();
      stage2.data.startTime = '12:00';
      const gameA = createGameNodeInStage('game-a', 'stage-1', {
        standing: 'A1',
        startTime: '09:45',
        manualTime: true,
      });
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.startTime).toBe('09:45');
      expect(movedGame.data.manualTime).toBe(true);
    });
  });

  describe('conflict rejection', () => {
    it('rejects moving a game to its own stage without changing state', () => {
      const { field1, stage1 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const initial = [field1, stage1, gameA];
      const { result, getNodes, rerender } = setupHook(initial);
      rerender({ nodes: getNodes() });
      const before = JSON.stringify(getNodes());

      let moveResult = true;
      act(() => {
        moveResult = result.current.moveNodeToStage('game-a', 'stage-1');
      });

      expect(moveResult).toBe(false);
      expect(JSON.stringify(getNodes())).toBe(before);
    });

    it('rejects an unknown game id', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2]);
      rerender({ nodes: getNodes() });

      let moveResult = true;
      act(() => {
        moveResult = result.current.moveNodeToStage('game-does-not-exist', 'stage-2');
      });

      expect(moveResult).toBe(false);
    });

    it('rejects an unknown target stage id', () => {
      const { field1, stage1 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const { result, getNodes, rerender } = setupHook([field1, stage1, gameA]);
      rerender({ nodes: getNodes() });

      let moveResult = true;
      act(() => {
        moveResult = result.current.moveNodeToStage('game-a', 'stage-does-not-exist');
      });

      expect(moveResult).toBe(false);
    });
  });

  describe('dependent state consistency', () => {
    it('preserves team assignments, dynamic references and officials', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', {
        standing: 'A1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        awayTeamDynamic: { type: 'winner', matchName: 'HF1' },
        official: { type: 'static', name: 'Refs' },
      });
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2, gameA]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2');
      });

      const movedGame = getNodes().find((n) => n.id === 'game-a') as GameNode;
      expect(movedGame.data.homeTeamId).toBe('team-1');
      expect(movedGame.data.awayTeamId).toBe('team-2');
      expect(movedGame.data.awayTeamDynamic).toEqual({ type: 'winner', matchName: 'HF1' });
      expect(movedGame.data.official).toEqual({ type: 'static', name: 'Refs' });
      expect(movedGame.data.standing).toBe('A1');
    });

    it('keeps unrelated nodes untouched', () => {
      const { field1, stage1, stage2 } = buildStructure();
      const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'A1' });
      const gameB = createGameNodeInStage('game-b', 'stage-2', { standing: 'B1' });
      const { result, getNodes, rerender } = setupHook([field1, stage1, stage2, gameA, gameB]);
      rerender({ nodes: getNodes() });

      act(() => {
        result.current.moveNodeToStage('game-a', 'stage-2');
      });

      const nodes = getNodes();
      expect(nodes.find((n) => n.id === 'game-b')).toEqual(gameB);
      expect(isStageNode(nodes.find((n) => n.id === 'stage-1') as FlowNode)).toBe(true);
      expect(isGameNode(nodes.find((n) => n.id === 'game-a') as FlowNode)).toBe(true);
    });
  });
});
