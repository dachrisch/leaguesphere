/**
 * Tests for FlowPropertiesPanel Component - Parent Container Display
 *
 * TDD RED Phase: Tests for showing parent container information:
 * - Display parent stage name (read-only)
 * - Display parent field name (derived from stage)
 * - Allow moving to different stage via dropdown
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlowPropertiesPanel, { type FlowPropertiesPanelProps } from '../FlowPropertiesPanel';
import {
  createFieldNode,
  createStageNode,
  createGameNodeInStage,
  createTeamNodeInStage,
  type FlowNode,
  type StageNode,
} from '../../types/flowchart';

const mockUpdateNode = vi.fn();
const mockDeleteNode = vi.fn();
const mockMoveToStage = vi.fn();

const defaultProps: FlowPropertiesPanelProps = {
  selectedNode: null,
  fields: [],
  matchNames: [],
  groupNames: ['Gruppe 1', 'Gruppe 2'],
  onUpdateNode: mockUpdateNode,
  onDeleteNode: mockDeleteNode,
};

describe('FlowPropertiesPanel - Parent Container Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Team node parent info', () => {
    it('displays parent stage name for team in container', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      const stage = createStageNode('stage-1', 'field-1', { name: 'Preliminary Round' });
      const team = createTeamNodeInStage(
        'team-1',
        'stage-1',
        { type: 'groupTeam', group: 0, team: 0 },
        '0_0'
      );

      const allStages: StageNode[] = [stage];

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={team}
          parentStage={stage}
          parentField={field}
          availableStages={allStages}
          onMoveToStage={mockMoveToStage}
        />
      );

      // Should display parent stage label
      expect(screen.getByText('Parent Stage')).toBeInTheDocument();
      // Stage name appears in both parent display and dropdown, so use getAllByText
      const stageNameElements = screen.getAllByText('Preliminary Round');
      expect(stageNameElements.length).toBeGreaterThanOrEqual(1);
    });

    it('displays parent field name for team in container', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      const stage = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const team = createTeamNodeInStage(
        'team-1',
        'stage-1',
        { type: 'groupTeam', group: 0, team: 0 },
        '0_0'
      );

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={team}
          parentStage={stage}
          parentField={field}
          availableStages={[stage]}
          onMoveToStage={mockMoveToStage}
        />
      );

      // Should display parent field
      expect(screen.getByText('Parent Field')).toBeInTheDocument();
      expect(screen.getByText('Main Field')).toBeInTheDocument();
    });

    it('shows warning when team has no parent container', () => {
      const team = createTeamNodeInStage(
        'team-1',
        undefined,
        { type: 'groupTeam', group: 0, team: 0 },
        '0_0'
      );

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={team}
          parentStage={null}
          parentField={null}
          availableStages={[]}
          onMoveToStage={mockMoveToStage}
        />
      );

      // Should show warning about missing container
      expect(screen.getByTestId('no-container-warning')).toBeInTheDocument();
    });
  });

  describe('Game node parent info', () => {
    it('displays parent stage name for game in container', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      // Use a unique stage name that won't conflict with the Stage dropdown
      const stage = createStageNode('stage-1', 'field-1', { name: 'Qualification Round' });
      const game = createGameNodeInStage('game-1', 'stage-1', { standing: 'HF1' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={game}
          parentStage={stage}
          parentField={field}
          availableStages={[stage]}
          onMoveToStage={mockMoveToStage}
        />
      );

      expect(screen.getByText('Parent Stage')).toBeInTheDocument();
      // Stage name appears in both parent display and dropdown, so use getAllByText
      const stageNameElements = screen.getAllByText('Qualification Round');
      expect(stageNameElements.length).toBeGreaterThanOrEqual(1);
    });

    it('displays parent field name for game in container', () => {
      const field = createFieldNode('field-1', { name: 'Side Field' });
      const stage = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const game = createGameNodeInStage('game-1', 'stage-1', { standing: 'HF1' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={game}
          parentStage={stage}
          parentField={field}
          availableStages={[stage]}
          onMoveToStage={mockMoveToStage}
        />
      );

      expect(screen.getByText('Parent Field')).toBeInTheDocument();
      expect(screen.getByText('Side Field')).toBeInTheDocument();
    });
  });

  describe('Move to different stage', () => {
    it('shows dropdown to move to different stage', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      const stage1 = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const stage2 = createStageNode('stage-2', 'field-1', { name: 'Finalrunde' });
      const game = createGameNodeInStage('game-1', 'stage-1', { standing: 'HF1' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={game}
          parentStage={stage1}
          parentField={field}
          availableStages={[stage1, stage2]}
          onMoveToStage={mockMoveToStage}
        />
      );

      // Should have a dropdown for moving
      const moveDropdown = screen.getByTestId('move-to-stage-select');
      expect(moveDropdown).toBeInTheDocument();

      // Should have both stages as options in the move dropdown
      const options = moveDropdown.querySelectorAll('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Vorrunde');
      expect(options[1]).toHaveTextContent('Finalrunde');
    });

    it('calls onMoveToStage when different stage selected', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      const stage1 = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });
      const stage2 = createStageNode('stage-2', 'field-1', { name: 'Finalrunde' });
      const game = createGameNodeInStage('game-1', 'stage-1', { standing: 'HF1' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={game}
          parentStage={stage1}
          parentField={field}
          availableStages={[stage1, stage2]}
          onMoveToStage={mockMoveToStage}
        />
      );

      const moveDropdown = screen.getByTestId('move-to-stage-select');
      fireEvent.change(moveDropdown, { target: { value: 'stage-2' } });

      expect(mockMoveToStage).toHaveBeenCalledWith('game-1', 'stage-2');
    });

    it('shows stages from multiple fields in dropdown', () => {
      const field1 = createFieldNode('field-1', { name: 'Field 1' });
      const field2 = createFieldNode('field-2', { name: 'Field 2' });
      const stage1 = createStageNode('stage-1', 'field-1', { name: 'Vorrunde F1' });
      const stage2 = createStageNode('stage-2', 'field-2', { name: 'Vorrunde F2' });
      const team = createTeamNodeInStage(
        'team-1',
        'stage-1',
        { type: 'groupTeam', group: 0, team: 0 },
        '0_0'
      );

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={team}
          parentStage={stage1}
          parentField={field1}
          availableStages={[stage1, stage2]}
          onMoveToStage={mockMoveToStage}
        />
      );

      const moveDropdown = screen.getByTestId('move-to-stage-select');
      const options = moveDropdown.querySelectorAll('option');
      expect(options).toHaveLength(2);
    });
  });

  describe('Field and Stage nodes', () => {
    it('does not show parent info for field nodes', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={field}
          parentStage={null}
          parentField={null}
          availableStages={[]}
          onMoveToStage={mockMoveToStage}
        />
      );

      expect(screen.queryByText('Parent Stage')).not.toBeInTheDocument();
      expect(screen.queryByText('Parent Field')).not.toBeInTheDocument();
    });

    it('shows parent field for stage nodes', () => {
      const field = createFieldNode('field-1', { name: 'Main Field' });
      const stage = createStageNode('stage-1', 'field-1', { name: 'Vorrunde' });

      render(
        <FlowPropertiesPanel
          {...defaultProps}
          selectedNode={stage}
          parentStage={null}
          parentField={field}
          availableStages={[]}
          onMoveToStage={mockMoveToStage}
        />
      );

      // Stage should show its parent field
      expect(screen.getByText('Parent Field')).toBeInTheDocument();
      expect(screen.getByText('Main Field')).toBeInTheDocument();
      // But not a parent stage (stages are inside fields, not other stages)
      expect(screen.queryByText('Parent Stage')).not.toBeInTheDocument();
    });
  });
});
