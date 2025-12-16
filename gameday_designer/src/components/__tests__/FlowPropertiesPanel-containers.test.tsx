/**
 * Tests for FlowPropertiesPanel Component - Container Support
 *
 * TDD RED Phase: Tests for editing Field and Stage node properties.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlowPropertiesPanel, { type FlowPropertiesPanelProps } from '../FlowPropertiesPanel';
import {
  createFieldNode,
  createStageNode,
  type FieldNodeData,
  type StageNodeData,
} from '../../types/flowchart';

const defaultProps: FlowPropertiesPanelProps = {
  selectedNode: null,
  fields: [],
  matchNames: [],
  groupNames: [],
  onUpdateNode: vi.fn(),
  onDeleteNode: vi.fn(),
};

describe('FlowPropertiesPanel - Container Support', () => {
  describe('Field node properties', () => {
    it('shows field properties when field node is selected', () => {
      const fieldNode = createFieldNode('field-1', { name: 'Main Field', order: 0 });

      render(<FlowPropertiesPanel {...defaultProps} selectedNode={fieldNode} />);

      expect(screen.getByText('Field Node')).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('Main Field');
    });

    it('allows editing field name', () => {
      const fieldNode = createFieldNode('field-1', { name: 'Main Field' });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={fieldNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'Feld 1' } });

      expect(onUpdateNode).toHaveBeenCalledWith('field-1', { name: 'Feld 1' });
    });

    it('allows editing field order', () => {
      const fieldNode = createFieldNode('field-1', { name: 'Field A', order: 0 });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={fieldNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const orderInput = screen.getByLabelText(/order/i);
      fireEvent.change(orderInput, { target: { value: '2' } });

      expect(onUpdateNode).toHaveBeenCalledWith('field-1', { order: 2 });
    });

    it('allows selecting field color', () => {
      const fieldNode = createFieldNode('field-1', { name: 'Field A', color: '#4CAF50' });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={fieldNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const colorInput = screen.getByLabelText(/color/i);
      fireEvent.change(colorInput, { target: { value: '#2196f3' } });

      // Browser normalizes hex colors to lowercase
      expect(onUpdateNode).toHaveBeenCalledWith('field-1', { color: '#2196f3' });
    });

    it('can delete field node with confirmation', () => {
      const fieldNode = createFieldNode('field-1', { name: 'Main Field' });
      const onDeleteNode = vi.fn();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={fieldNode}
          onDeleteNode={onDeleteNode}
        />
      );

      fireEvent.click(screen.getByTestId('delete-node-button'));

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('field')
      );
      expect(onDeleteNode).toHaveBeenCalledWith('field-1');
    });
  });

  describe('Stage node properties', () => {
    it('shows stage properties when stage node is selected', () => {
      const stageNode = createStageNode('stage-1', 'field-1', {
        name: 'Vorrunde',
        stageType: 'vorrunde',
      });

      render(<FlowPropertiesPanel {...defaultProps} selectedNode={stageNode} />);

      expect(screen.getByText('Stage Node')).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('Vorrunde');
    });

    it('allows editing stage name', () => {
      const stageNode = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={stageNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: 'Gruppenphase' } });

      expect(onUpdateNode).toHaveBeenCalledWith('stage-1', { name: 'Gruppenphase' });
    });

    it('allows changing stage type', () => {
      const stageNode = createStageNode('stage-1', 'field-1', {
        name: 'Vorrunde',
        stageType: 'vorrunde',
      });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={stageNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const typeSelect = screen.getByLabelText(/type/i);
      fireEvent.change(typeSelect, { target: { value: 'finalrunde' } });

      expect(onUpdateNode).toHaveBeenCalledWith('stage-1', { stageType: 'finalrunde' });
    });

    it('allows editing stage order', () => {
      const stageNode = createStageNode('stage-1', 'field-1', { order: 0 });
      const onUpdateNode = vi.fn();

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={stageNode}
          onUpdateNode={onUpdateNode}
        />
      );

      const orderInput = screen.getByLabelText(/order/i);
      fireEvent.change(orderInput, { target: { value: '1' } });

      expect(onUpdateNode).toHaveBeenCalledWith('stage-1', { order: 1 });
    });

    it('shows stage type options', () => {
      const stageNode = createStageNode('stage-1', 'field-1');

      render(<FlowPropertiesPanel {...defaultProps} selectedNode={stageNode} />);

      const typeSelect = screen.getByLabelText(/type/i);
      expect(typeSelect).toBeInTheDocument();

      // Check options are available
      expect(screen.getByRole('option', { name: /vorrunde/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /finalrunde/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /platzierung/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /custom/i })).toBeInTheDocument();
    });

    it('can delete stage node with confirmation', () => {
      const stageNode = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const onDeleteNode = vi.fn();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={stageNode}
          onDeleteNode={onDeleteNode}
        />
      );

      fireEvent.click(screen.getByTestId('delete-node-button'));

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('stage')
      );
      expect(onDeleteNode).toHaveBeenCalledWith('stage-1');
    });
  });

  describe('Game node in container', () => {
    it('hides field selector when game is inside a container hierarchy', () => {
      // When a game is inside a stage, the field is derived from hierarchy
      // so we shouldn't show the field dropdown
      const gameNode = {
        id: 'game-1',
        type: 'game' as const,
        parentId: 'stage-1', // Has parent stage
        position: { x: 0, y: 0 },
        data: {
          type: 'game' as const,
          stage: 'Vorrunde',
          standing: 'HF1',
          fieldId: null,
          official: null,
          breakAfter: 0,
        },
      };

      render(<FlowPropertiesPanel {...defaultProps} selectedNode={gameNode} />);

      // Field selector should not be visible for games inside containers
      expect(screen.queryByLabelText(/field/i)).not.toBeInTheDocument();
    });

    it('shows field info text for container games', () => {
      const gameNode = {
        id: 'game-1',
        type: 'game' as const,
        parentId: 'stage-1',
        position: { x: 0, y: 0 },
        data: {
          type: 'game' as const,
          stage: 'Vorrunde',
          standing: 'HF1',
          fieldId: null,
          official: null,
          breakAfter: 0,
        },
      };

      render(<FlowPropertiesPanel {...defaultProps} selectedNode={gameNode} />);

      // Should show text indicating field is derived from container
      expect(screen.getByText(/derived from container/i)).toBeInTheDocument();
    });
  });
});
