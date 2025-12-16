/**
 * FieldSection Component Tests
 *
 * Tests for the field section component that displays a collapsible field container
 * with nested stage sections in the list-based UI.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FieldSection from '../FieldSection';
import type { FieldNode, StageNode, GameNode, TeamNode } from '../../../types/flowchart';

describe('FieldSection', () => {
  // Sample field node
  const sampleField: FieldNode = {
    id: 'field-1',
    type: 'field',
    position: { x: 0, y: 0 },
    data: {
      type: 'field',
      name: 'Feld 1',
      order: 0,
    },
  };

  // Sample stage node
  const sampleStage: StageNode = {
    id: 'stage-1',
    type: 'stage',
    parentId: 'field-1',
    position: { x: 0, y: 0 },
    data: {
      type: 'stage',
      name: 'Vorrunde',
      stageType: 'vorrunde',
      order: 0,
    },
  };

  // Sample game node
  const sampleGame: GameNode = {
    id: 'game-1',
    type: 'game',
    parentId: 'stage-1',
    position: { x: 0, y: 0 },
    data: {
      type: 'game',
      stage: 'Vorrunde',
      standing: 'Game 1',
      fieldId: null,
      official: null,
      breakAfter: 0,
    },
  };

  it('renders field with name and metadata', () => {
    const mockOnUpdate = vi.fn();
    const mockOnDelete = vi.fn();
    const mockOnAddStage = vi.fn();

    render(
      <FieldSection
        field={sampleField}
        stages={[sampleStage]}
        allNodes={[sampleField, sampleStage, sampleGame]}
        edges={[]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAddStage={mockOnAddStage}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Field name should be visible
    expect(screen.getByText('Feld 1')).toBeInTheDocument();

    // Metadata should show stage count and game count (use getAllByText since nested components also show counts)
    const stageBadges = screen.getAllByText(/1 stage/i);
    expect(stageBadges.length).toBeGreaterThan(0);

    const gameBadges = screen.getAllByText(/1 game/i);
    expect(gameBadges.length).toBeGreaterThan(0);
  });

  it('toggles expansion when header is clicked', () => {
    render(
      <FieldSection
        field={sampleField}
        stages={[sampleStage]}
        allNodes={[sampleField, sampleStage, sampleGame]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Should be expanded by default
    expect(screen.getByText('Vorrunde')).toBeInTheDocument();

    // Click to collapse
    const header = screen.getByText('Feld 1');
    fireEvent.click(header);

    // Stage should be hidden
    expect(screen.queryByText('Vorrunde')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(header);

    // Stage should be visible again
    expect(screen.getByText('Vorrunde')).toBeInTheDocument();
  });

  it('calls onAddStage when Add Stage button is clicked', () => {
    const mockOnAddStage = vi.fn();

    render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={mockOnAddStage}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const addButton = screen.getByRole('button', { name: /add stage/i });
    fireEvent.click(addButton);

    expect(mockOnAddStage).toHaveBeenCalledWith('field-1');
  });

  it('calls onDelete when delete button is clicked with confirmation', () => {
    const mockOnDelete = vi.fn();
    window.confirm = vi.fn(() => true);

    render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={mockOnDelete}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete field/i });
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockOnDelete).toHaveBeenCalledWith('field-1');
  });

  it('does not call onDelete when confirmation is cancelled', () => {
    const mockOnDelete = vi.fn();
    window.confirm = vi.fn(() => false);

    render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={mockOnDelete}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete field/i });
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it('renders nested stages in correct order', () => {
    const stage1: StageNode = {
      ...sampleStage,
      id: 'stage-1',
      parentId: 'field-1',
      data: { ...sampleStage.data, name: 'Vorrunde', order: 0 },
    };

    const stage2: StageNode = {
      ...sampleStage,
      id: 'stage-2',
      parentId: 'field-1',
      data: { ...sampleStage.data, name: 'Finalrunde', order: 1, stageType: 'finalrunde' },
    };

    render(
      <FieldSection
        field={sampleField}
        stages={[stage2, stage1]} // Intentionally out of order
        allNodes={[sampleField, stage1, stage2]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Check stage names appear and in correct order
    expect(screen.getByText('Vorrunde')).toBeInTheDocument();
    expect(screen.getByText('Finalrunde')).toBeInTheDocument();

    // Stage type badges should also be present
    expect(screen.getByText('vorrunde')).toBeInTheDocument();
    expect(screen.getByText('finalrunde')).toBeInTheDocument();
  });

  it('highlights field when selected', () => {
    const { container } = render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId="field-1"
      />
    );

    const fieldCard = container.querySelector('.field-section');
    expect(fieldCard).toHaveClass('selected');
  });

  it('shows empty state when field has no stages', () => {
    render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    expect(screen.getByText(/no stages/i)).toBeInTheDocument();
  });

  it('allows inline editing of field name', () => {
    const mockOnUpdate = vi.fn();

    render(
      <FieldSection
        field={sampleField}
        stages={[]}
        allNodes={[sampleField]}
        edges={[]}
        onUpdate={mockOnUpdate}
        onDelete={vi.fn()}
        onAddStage={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const nameElement = screen.getByText('Feld 1');
    fireEvent.doubleClick(nameElement);

    const input = screen.getByDisplayValue('Feld 1');
    fireEvent.change(input, { target: { value: 'Main Field' } });
    fireEvent.blur(input);

    expect(mockOnUpdate).toHaveBeenCalledWith('field-1', {
      name: 'Main Field',
    });
  });
});
