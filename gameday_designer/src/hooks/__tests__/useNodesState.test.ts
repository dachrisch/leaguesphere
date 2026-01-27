/**
 * Tests for useNodesState Hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodesState } from '../useNodesState';
import {
  isFieldNode,
  isStageNode,
} from '../../types/flowchart';

describe('useNodesState', () => {
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

  describe('addFieldNode', () => {
    it('creates a field container node', () => {
      const { result, getNodes } = setupHook();

      act(() => {
        result.current.addFieldNode();
      });

      const nodes = getNodes();
      expect(nodes).toHaveLength(1);
      expect(isFieldNode(nodes[0])).toBe(true);
      expect(nodes[0].data.name).toBe('Feld 1');
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
      expect(nodes[0].data.name).toBe('Updated Field');
    });
  });

  describe('deleteNode', () => {
    it('deletes field and its children', () => {
      const { result, getNodes, rerender } = setupHook();

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

      expect(ids?.fieldId).toBe(fieldId);
      expect(getNodes()).toHaveLength(2); // Field + new Stage
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

      expect(ids?.fieldId).toBe(fieldId);
      expect(ids?.stageId).toBe(stageId);
      expect(getNodes()).toHaveLength(2);
    });
  });
});
