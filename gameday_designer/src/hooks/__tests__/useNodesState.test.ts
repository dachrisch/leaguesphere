/**
 * Tests for useNodesState Hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodesState } from '../useNodesState';
import {
  isFieldNode,
  isStageNode,
  isGameNode,
} from '../../types/flowchart';
import type { FlowNode, GameNode, FieldNode, StageNode, FieldNodeData, StageNodeData, GameNodeData } from '../../types/flowchart';
import { DEFAULT_GAME_DURATION, DEFAULT_BREAK_BETWEEN_GAMES } from '../../utils/tournamentConstants';

describe('useNodesState', () => {
  const setupHook = (
    initialNodes: FlowNode[] = [],
    globalDefaults?: { defaultGameDuration?: number; defaultBreakBetweenGames?: number }
  ) => {
    let nodes = initialNodes;
    const setNodes = vi.fn((update) => {
      if (typeof update === 'function') {
        nodes = update(nodes);
      } else {
        nodes = update;
      }
    });

    const onNodesDeleted = vi.fn();

    const { result, rerender } = renderHook(
      ({ nodes }) => useNodesState(nodes, setNodes, onNodesDeleted, globalDefaults),
      { initialProps: { nodes } }
    );

    return { result, setNodes, getNodes: () => nodes, rerender, onNodesDeleted };
  };

  describe('addFieldNode', () => {
    it('creates a field container node', () => {
      const { result, getNodes } = setupHook();

      act(() => {
        result.current.addFieldNode();
      });

      const nodes = getNodes();
      expect(nodes).toHaveLength(1);
      expect(isFieldNode(nodes[0])).toBe(true);
      expect((nodes[0] as FieldNode).data.name).toBe('Feld 1');
    });

    it('creates field with stage by default', () => {
      const { result, getNodes } = setupHook();

      act(() => {
        result.current.addFieldNode(undefined, true);
      });

      const nodes = getNodes();
      expect(nodes).toHaveLength(2);
      expect(isFieldNode(nodes[0])).toBe(true);
      expect(isStageNode(nodes[1])).toBe(true);
      expect(nodes[1].parentId).toBe(nodes[0].id);
    });
  });

  describe('addStageNode', () => {
    it('creates a stage inside a field', () => {
      const { result, getNodes, rerender } = setupHook();

      let fieldId: string = '';
      act(() => {
        fieldId = result.current.addFieldNode().id;
      });

      rerender({ nodes: getNodes() });

      act(() => {
        result.current.addStageNode(fieldId);
      });

      const nodes = getNodes();
      const stage = nodes.find(isStageNode);
      expect(stage).toBeDefined();
      expect(stage?.parentId).toBe(fieldId);
    });

    it('sets custom category for second stage', () => {
      const { result, getNodes, rerender } = setupHook();
      let fid = '';
      act(() => { fid = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });
      act(() => { result.current.addStageNode(fid); }); // First
      rerender({ nodes: getNodes() });
      act(() => { result.current.addStageNode(fid); }); // Second
      rerender({ nodes: getNodes() });
      act(() => { result.current.addStageNode(fid); }); // Third -> Custom
      
      const nodes = getNodes();
      const stages = nodes.filter(isStageNode);
      expect(stages[1].data.name).toBe('Final');
      expect(stages[2].data.category).toBe('custom');
    });
  });

  describe('updateNode', () => {
    it('updates node data', () => {
      const { result, getNodes, rerender } = setupHook();

      let fieldId: string = '';
      act(() => {
        fieldId = result.current.addFieldNode().id;
      });

      rerender({ nodes: getNodes() });

      act(() => {
        result.current.updateNode(fieldId, { name: 'Updated Field' });
      });

      const nodes = getNodes();
      expect((nodes[0] as FieldNode).data.name).toBe('Updated Field');
    });
  });

  describe('deleteNode', () => {
    it('deletes field and its children', () => {
      const { result, getNodes, rerender, onNodesDeleted } = setupHook();

      let fieldId: string = '';
      act(() => {
        fieldId = result.current.addFieldNode(undefined, true).id;
      });

      rerender({ nodes: getNodes() });

      expect(getNodes()).toHaveLength(2);

      act(() => {
        result.current.deleteNode(fieldId);
      });

      expect(getNodes()).toHaveLength(0);
      expect(onNodesDeleted).toHaveBeenCalled();
    });

    it('cascades deletion from stage to games', () => {
      const { result, getNodes, rerender } = setupHook();
      let stageId = '';
      let fieldId = '';
      act(() => { 
        fieldId = result.current.addFieldNode().id;
      });
      rerender({ nodes: getNodes() });
      act(() => {
        stageId = result.current.addStageNode(fieldId)!.id;
      });
      rerender({ nodes: getNodes() });
      act(() => { result.current.addGameNodeInStage(stageId); });
      rerender({ nodes: getNodes() });
      
      expect(getNodes()).toHaveLength(3);
      act(() => { result.current.deleteNode(stageId); });
      expect(getNodes()).toHaveLength(1); // Only field left
    });

    it('triggers onEdgesDeleted callback', () => {
      const { result, getNodes, rerender } = setupHook();
      const mockOnEdgesDeleted = vi.fn();
      let fieldId = '';
      act(() => { fieldId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });
      act(() => { result.current.deleteNode(fieldId, mockOnEdgesDeleted); });
      expect(mockOnEdgesDeleted).toHaveBeenCalled();
    });
  });

  describe('ensureContainerHierarchy', () => {
    it('creates field and stage when empty', () => {
      const { result, getNodes } = setupHook();
      let ids: { fieldId: string; stageId: string } | null = null;
      
      act(() => {
        ids = result.current.ensureContainerHierarchy(null);
      });

      expect(ids).not.toBeNull();
      expect(getNodes().find(n => n.id === ids?.fieldId)).toBeDefined();
      expect(getNodes().find(n => n.id === ids?.stageId)).toBeDefined();
    });

    it('adds stage to existing field if missing', () => {
      const { result, getNodes, rerender } = setupHook();
      let fieldId: string = '';
      
      act(() => {
        fieldId = result.current.addFieldNode().id;
      });
      
      rerender({ nodes: getNodes() });
      expect(getNodes()).toHaveLength(1);

      let ids: { fieldId: string; stageId: string } | null = null;
      act(() => {
        ids = result.current.ensureContainerHierarchy(fieldId);
      });

      expect(ids!.fieldId).toBe(fieldId);
      expect(getNodes()).toHaveLength(2); // Field + new Stage
    });

    it('creates stage in existing field even if not selected', () => {
      const { result, getNodes, rerender } = setupHook();
      let fieldId: string = '';
      act(() => { fieldId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });
      
      let ids: { fieldId: string; stageId: string } | null = null;
      act(() => { ids = result.current.ensureContainerHierarchy(null); });
      expect(ids!.fieldId).toBe(fieldId);
      expect(getNodes()).toHaveLength(2);
    });

    it('returns existing IDs if hierarchy already exists', () => {
      const { result, getNodes, rerender } = setupHook();
      let fieldId: string = '';
      let stageId: string = '';
      
      act(() => {
        const field = result.current.addFieldNode(undefined, true);
        fieldId = field.id;
      });
      
      rerender({ nodes: getNodes() });
      stageId = getNodes().find(n => n.type === 'stage')!.id;

      let ids: { fieldId: string; stageId: string } | null = null;
      act(() => {
        ids = result.current.ensureContainerHierarchy(stageId);
      });

      expect(ids!.fieldId).toBe(fieldId);
      expect(ids!.stageId).toBe(stageId);
      expect(getNodes()).toHaveLength(2);
    });

    it('returns first stage if invalid ID is passed but hierarchy exists', () => {
      const { result, getNodes, rerender } = setupHook();
      let fieldId = '';
      act(() => {
        const f = result.current.addFieldNode(undefined, true);
        fieldId = f.id;
      });
      rerender({ nodes: getNodes() });
      const stageId = getNodes().find(n => n.parentId === fieldId && isStageNode(n))!.id;

      let ids: { fieldId: string; stageId: string } | null = null;
      act(() => {
        ids = result.current.ensureContainerHierarchy('invalid-id');
      });
      expect(ids!.fieldId).toBe(fieldId);
      expect(ids!.stageId).toBe(stageId);
    });
  });

  describe('addGameNodeInStage', () => {
    it('creates hierarchy if stageId is missing', () => {
      const { result, getNodes } = setupHook();
      act(() => { result.current.addGameNodeInStage(); });
      expect(getNodes()).toHaveLength(3); // field, stage, game
    });

    it('bakes duration/breakAfter from the target stage defaults when no explicit options are given', () => {
      const { result, getNodes, rerender } = setupHook();

      let fieldId = '';
      act(() => { fieldId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });

      let stageId = '';
      act(() => {
        stageId = result.current.addStageNode(fieldId, undefined)!.id;
      });
      rerender({ nodes: getNodes() });

      // Give the stage non-default resolved defaults directly (as if it had
      // been created with custom global defaults or edited afterwards).
      act(() => {
        result.current.updateNode(stageId, { defaultGameDuration: 45, defaultBreakBetweenGames: 15 });
      });
      rerender({ nodes: getNodes() });

      act(() => { result.current.addGameNodeInStage(stageId); });

      const game = getNodes().find(isGameNode) as GameNode;
      expect(game.data.duration).toBe(45);
      expect(game.data.breakAfter).toBe(15);
    });

    it('falls back to globalDefaults when the target stage has no resolved defaults', () => {
      const stage = {
        id: 'stage-1',
        type: 'stage',
        parentId: 'field-1',
        position: { x: 0, y: 0 },
        data: { type: 'stage', name: 'S', category: 'preliminary', stageType: 'STANDARD', order: 0 } as unknown as StageNodeData,
      } as unknown as StageNode;
      const { result, getNodes } = setupHook([stage], { defaultGameDuration: 55, defaultBreakBetweenGames: 10 });

      act(() => { result.current.addGameNodeInStage('stage-1'); });

      const game = getNodes().find(isGameNode) as GameNode;
      expect(game.data.duration).toBe(55);
      expect(game.data.breakAfter).toBe(10);
    });

    it('falls back to the built-in constants when neither the stage nor globalDefaults provide a value', () => {
      const { result, getNodes } = setupHook();
      act(() => { result.current.addGameNodeInStage(); });

      const game = getNodes().find(isGameNode) as GameNode;
      expect(game.data.duration).toBe(DEFAULT_GAME_DURATION);
      expect(game.data.breakAfter).toBe(DEFAULT_BREAK_BETWEEN_GAMES);
    });

    it('lets explicit options override both the stage defaults and globalDefaults', () => {
      const stage = {
        id: 'stage-1',
        type: 'stage',
        parentId: 'field-1',
        position: { x: 0, y: 0 },
        data: {
          type: 'stage', name: 'S', category: 'preliminary', stageType: 'STANDARD', order: 0,
          defaultGameDuration: 45, defaultBreakBetweenGames: 15,
        } as unknown as StageNodeData,
      } as unknown as StageNode;
      const { result, getNodes } = setupHook([stage], { defaultGameDuration: 55, defaultBreakBetweenGames: 10 });

      act(() => { result.current.addGameNodeInStage('stage-1', { duration: 30, breakAfter: 5 }); });

      const game = getNodes().find(isGameNode) as GameNode;
      expect(game.data.duration).toBe(30);
      expect(game.data.breakAfter).toBe(5);
    });
  });

  describe('addStageNode / hierarchy creation with globalDefaults', () => {
    it('addStageNode seeds the new stage defaults from globalDefaults', () => {
      const { result, getNodes, rerender } = setupHook([], { defaultGameDuration: 40, defaultBreakBetweenGames: 8 });

      let fieldId = '';
      act(() => { fieldId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });

      act(() => { result.current.addStageNode(fieldId); });

      const stage = getNodes().find(isStageNode) as StageNode;
      expect(stage.data.defaultGameDuration).toBe(40);
      expect(stage.data.defaultBreakBetweenGames).toBe(8);
    });

    it('addStageNode falls back to the built-in constants without globalDefaults', () => {
      const { result, getNodes, rerender } = setupHook();

      let fieldId = '';
      act(() => { fieldId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });

      act(() => { result.current.addStageNode(fieldId); });

      const stage = getNodes().find(isStageNode) as StageNode;
      expect(stage.data.defaultGameDuration).toBe(DEFAULT_GAME_DURATION);
      expect(stage.data.defaultBreakBetweenGames).toBe(DEFAULT_BREAK_BETWEEN_GAMES);
    });

    it('ensureContainerHierarchy seeds newly created stages from globalDefaults', () => {
      const { result, getNodes } = setupHook([], { defaultGameDuration: 33, defaultBreakBetweenGames: 3 });

      act(() => { result.current.ensureContainerHierarchy(null); });

      const stage = getNodes().find(isStageNode) as StageNode;
      expect(stage.data.defaultGameDuration).toBe(33);
      expect(stage.data.defaultBreakBetweenGames).toBe(3);
    });
  });

  describe('addBulkTournament', () => {
    it('adds multiple nodes at once', () => {
      const { result, getNodes } = setupHook();
      const structure = {
        fields: [{ id: 'f1', type: 'field', data: { name: 'F1' } as unknown as FieldNodeData, position: { x: 0, y: 0 } } as unknown as FieldNode],
        stages: [{ id: 's1', type: 'stage', data: { name: 'S1' } as unknown as StageNodeData, position: { x: 0, y: 0 } } as unknown as StageNode],
        games: [{ id: 'g1', type: 'game', data: { standing: 'G1' } as unknown as GameNodeData, position: { x: 0, y: 0 } } as unknown as GameNode],
        edges: [],
      };
      act(() => { result.current.addBulkTournament(structure); });
      expect(getNodes()).toHaveLength(3);
    });
  });

  describe('updateNode time recalculation', () => {
    it('recalculates game times and sorts by standing', () => {
      const { result, getNodes, rerender } = setupHook();
      let sId = '';
      let g1Id = '', g2Id = '';
      let fId = '';
      act(() => { 
        fId = result.current.addFieldNode().id;
      });
      rerender({ nodes: getNodes() });
      act(() => {
        const s = result.current.addStageNode(fId, { name: 'S1' })!;
        sId = s.id;
      });
      rerender({ nodes: getNodes() });
      act(() => { g2Id = result.current.addGameNodeInStage(sId, { standing: '2' }).id; });
      rerender({ nodes: getNodes() });
      act(() => { g1Id = result.current.addGameNodeInStage(sId, { standing: '1' }).id; });
      rerender({ nodes: getNodes() });

      // Sort should ensure G1 (standing '1') is first and G2 (standing '2') is second
      act(() => { result.current.updateNode(sId, { startTime: '10:00' }); });
      rerender({ nodes: getNodes() });

      const nodes = getNodes();
      const g1 = nodes.find(n => n.id === g1Id) as GameNode;
      const g2 = nodes.find(n => n.id === g2Id) as GameNode;
      expect(g1.data.startTime).toBe('10:00');
      expect(g2.data.startTime).not.toBe('10:00'); // G2 should be after G1
    });

    it('recalculates game times when game duration changes', () => {
      const { result, getNodes, rerender } = setupHook();
      let sId = '';
      let g1Id = '';
      let g2Id = '';
      let fId = '';
      act(() => { fId = result.current.addFieldNode().id; });
      rerender({ nodes: getNodes() });
      act(() => {
        const s = result.current.addStageNode(fId, { name: 'S1' })!;
        sId = s.id;
      });
      rerender({ nodes: getNodes() });
      act(() => {
        result.current.updateNode(sId, { startTime: '10:00' });
      });
      rerender({ nodes: getNodes() });
      act(() => { g1Id = result.current.addGameNodeInStage(sId, { standing: '1' }).id; });
      rerender({ nodes: getNodes() });
      act(() => { g2Id = result.current.addGameNodeInStage(sId, { standing: '2' }).id; });
      rerender({ nodes: getNodes() });

      // G1 at 10:00, G2 at 11:10 (default 70m)
      act(() => { result.current.updateNode(g1Id, { duration: 60 }); });
      rerender({ nodes: getNodes() });

      const g2 = getNodes().find(n => n.id === g2Id) as GameNode;
      expect(g2.data.startTime).toBe('11:00');
    });
  });

  describe('hierarchy queries', () => {
    it('getTargetStage returns stage for selected game', () => {
      const { result, getNodes, rerender } = setupHook();
      let gId = '';
      let fId = '';
      let sId = '';
      act(() => {
        fId = result.current.addFieldNode().id;
      });
      rerender({ nodes: getNodes() });
      act(() => {
        sId = result.current.addStageNode(fId)!.id;
      });
      rerender({ nodes: getNodes() });
      act(() => { gId = result.current.addGameNodeInStage(sId).id; });
      rerender({ nodes: getNodes() });

      const target = result.current.getTargetStage(gId);
      expect(target?.id).toBe(sId);
    });

    it('getGameField and getGameStage return parent containers', () => {
      const { result, getNodes, rerender } = setupHook();
      let gId = '';
      let fId = '';
      let sId = '';
      act(() => {
        fId = result.current.addFieldNode().id;
      });
      rerender({ nodes: getNodes() });
      act(() => {
        sId = result.current.addStageNode(fId)!.id;
      });
      rerender({ nodes: getNodes() });
      act(() => { gId = result.current.addGameNodeInStage(sId).id; });
      rerender({ nodes: getNodes() });

      expect(result.current.getGameField(gId)?.id).toBe(fId);
      expect(result.current.getGameStage(gId)?.id).toBe(sId);
    });
  });
});