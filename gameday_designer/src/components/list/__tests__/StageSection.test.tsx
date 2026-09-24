/**
 * StageSection Component Tests
 *
 * Tests for the stage section component that displays a collapsible stage container
 * with nested team and game tables in the list-based UI.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import type { StageNode, GameNode, FieldNode } from '../../../types/flowchart';
import type { StageSectionProps } from '../StageSection';

const defaultFieldContext: FieldNode = {
  id: 'field-1',
  type: 'field',
  position: { x: 0, y: 0 },
  data: { type: 'field', name: 'Field 1', order: 0 },
};

// Helper function to create default props
const createDefaultProps = (overrides: Partial<StageSectionProps> = {}): StageSectionProps => ({
  stage: {} as StageNode,
  fieldContext: defaultFieldContext,
  allNodes: [],
  edges: [],
  globalTeams: [],
  globalTeamGroups: [],
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onSelectNode: vi.fn(),
  onHighlightElement: vi.fn(),
  selectedNodeId: null,
  onAssignTeam: vi.fn(),
  onSwapTeams: vi.fn(),
  onAddGame: vi.fn(),
  highlightedElement: null,
  onDynamicReferenceClick: vi.fn(),
  onAddGameToGameEdge: vi.fn(),
  onAddStageToGameEdge: vi.fn(),
  onRemoveEdgeFromSlot: vi.fn(),
  onOpenResultModal: vi.fn(),
  onNotify: vi.fn(),
  isExpanded: true,
  readOnly: false,
  ...overrides,
});

const renderStage = (props: StageSectionProps) => {
  return render(
    <GamedayProvider>
      <StageSection {...props} />
    </GamedayProvider>
  );
};

describe('StageSection', () => {
  // Sample stage node
  const sampleStage: StageNode = {
    id: 'stage-1',
    type: 'stage',
    parentId: 'field-1',
    position: { x: 0, y: 0 },
    data: {
      type: 'stage',
      name: 'Preliminary',
      category: 'preliminary',
      stageType: 'STANDARD',
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
      stage: 'Preliminary',
      stageType: 'STANDARD',
      standing: 'Game 1',
      fieldId: null,
      official: null,
      breakAfter: 0,
      homeTeamId: null,
      awayTeamId: null,
      homeTeamDynamic: null,
      awayTeamDynamic: null,
    },
  };

  it('renders stage with name and type badge', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame],
      })
    );

    // Stage name should be visible
    expect(screen.getByText('Preliminary')).toBeInTheDocument();
  });

  it('shows games when expanded', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame],
      })
    );

    // Should be expanded - there are now TWO "Add Game" buttons (header + body)
    const addGameButtons = screen.getAllByTitle(i18n.t('ui:tooltip.addGame'));
    expect(addGameButtons.length).toBeGreaterThan(0);
  });

  it('calls onDelete when delete button is clicked', () => {
    const mockOnDelete = vi.fn();

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
        onDelete: mockOnDelete,
      })
    );

    const deleteButton = screen.getByTitle(i18n.t('ui:tooltip.deleteStage'));
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith('stage-1');
  });

  it('shows a fields multi-select in edit mode when more than one field exists', () => {
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };
    const field2 = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [field1, field2, sampleStage, sampleGame],
      })
    );

    fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

    expect(screen.getByLabelText(/fields/i)).toBeInTheDocument();
    expect(screen.getByText('Feld 1')).toBeInTheDocument();
    expect(screen.getByText('Feld 2')).toBeInTheDocument();
  });

  it('calls onUpdate with fieldIds when multiple fields are selected', () => {
    const mockOnUpdate = vi.fn();
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };
    const field2 = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [field1, field2, sampleStage, sampleGame],
        onUpdate: mockOnUpdate,
      })
    );

    fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

    const select = screen.getByLabelText(/fields/i) as HTMLSelectElement;
    const options = Array.from(select.options);
    options.forEach((o) => { o.selected = true; });
    fireEvent.change(select);

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', { fieldIds: ['field-1', 'field-2'] });
  });

  it('calls onUpdate with fieldIds: undefined when all fields are deselected', () => {
    const mockOnUpdate = vi.fn();
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };
    const field2 = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [field1, field2, sampleStage, sampleGame],
        onUpdate: mockOnUpdate,
      })
    );

    fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

    const select = screen.getByLabelText(/fields/i) as HTMLSelectElement;
    Array.from(select.options).forEach((o) => { o.selected = false; });
    fireEvent.change(select);

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', { fieldIds: undefined });
  });

  it('shows a position/count badge when the stage already spans multiple fields', () => {
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };
    const field2 = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };
    const multiFieldStage: StageNode = {
      ...sampleStage,
      data: { ...sampleStage.data, fieldIds: ['field-1', 'field-2'] },
    };

    renderStage(
      createDefaultProps({
        stage: multiFieldStage,
        fieldContext: field1,
        allNodes: [field1, field2, multiFieldStage, sampleGame],
      })
    );

    // This card represents field-1, the first of the stage's two fields.
    expect(screen.getByText('1/2')).toBeInTheDocument();
    // Placement is implicit by which field's card a game was added under --
    // no manual field picker exists anymore (see GameTable's own tests).
    expect(screen.queryByRole('combobox', { name: /field/i })).not.toBeInTheDocument();
  });

  it('does not show the multi-field badge for a single-field stage', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame],
      })
    );

    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  it('only shows games actually played on this card\'s field', () => {
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };
    const field2 = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };
    const multiFieldStage: StageNode = {
      ...sampleStage,
      data: { ...sampleStage.data, fieldIds: ['field-1', 'field-2'] },
    };
    const gameOnField2: GameNode = {
      ...sampleGame,
      id: 'game-2',
      data: { ...sampleGame.data, standing: 'Game 2', fieldId: 'field-2' },
    };

    renderStage(
      createDefaultProps({
        stage: multiFieldStage,
        fieldContext: field1,
        allNodes: [field1, field2, multiFieldStage, sampleGame, gameOnField2],
      })
    );

    expect(screen.getByText('Game 1')).toBeInTheDocument();
    expect(screen.queryByText('Game 2')).not.toBeInTheDocument();
  });

  it('does not show a fields multi-select when only one field exists', () => {
    const field1 = { id: 'field-1', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 1', order: 0 } };

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [field1, sampleStage, sampleGame],
      })
    );

    fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

    expect(screen.queryByLabelText(/fields/i)).not.toBeInTheDocument();
  });

  it('shows correct stage name for different stages', () => {
    const finalStage: StageNode = {
      ...sampleStage,
      data: {
        ...sampleStage.data,
        name: 'Final',
        category: 'final',
      },
    };

    renderStage(
      createDefaultProps({
        stage: finalStage,
        allNodes: [finalStage],
      })
    );

    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('allows inline editing of stage name', () => {
    const mockOnUpdate = vi.fn();

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
        onUpdate: mockOnUpdate,
      })
    );

    // Click the edit button
    const editButton = screen.getByTitle(i18n.t('ui:tooltip.editStageName'));
    fireEvent.click(editButton);

    const input = screen.getByDisplayValue('Preliminary');
    fireEvent.change(input, { target: { value: 'Neue Vorrunde' } });
    fireEvent.blur(input);

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', {
      name: 'Neue Vorrunde',
    });
  });

  it('displays Games section', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame],
      })
    );

    // Should have game table section
    expect(screen.getByText(/Games/i)).toBeInTheDocument();
  });

  it('shows empty state when stage has no games', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
      })
    );

    // Should show empty state for games
    expect(screen.getByText(/no games/i)).toBeInTheDocument();
  });

  it('counts only games in this stage', () => {
    // Create nodes from a different stage
    const otherGame: GameNode = {
      ...sampleGame,
      id: 'game-2',
      parentId: 'stage-2',
    };

    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame, otherGame],
      })
    );

    expect(screen.getByText('Game 1')).toBeInTheDocument();
  });

  describe('Add Game button pattern', () => {
    it('Add Game button is in the header', () => {
      const { container } = renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, sampleGame],
        })
      );

      const header = container.querySelector('.stage-section__header');

      // Header should contain Add Game button
      const addButtonInHeader = header?.querySelector('button[aria-label*="Add Game"]');
      expect(addButtonInHeader).toBeInTheDocument();
    });

    it('calls onAddGame when Add Game button is clicked', () => {
      const mockOnAddGame = vi.fn();

      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onAddGame: mockOnAddGame,
        })
      );

      // Get header Add Game button
      const addButtons = screen.getAllByTitle(/add a new game/i);
      fireEvent.click(addButtons[0]);

      // fieldContext (field-1) is this stage's home field, so no explicit
      // field is passed -- the game defaults to the home field.
      expect(mockOnAddGame).toHaveBeenCalledWith('stage-1', undefined);
    });

    it('No Add Game button appears at bottom when games exist', () => {
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, sampleGame],
        })
      );

      // Should only find one Add Game button (in header)
      const addButtons = screen.getAllByTitle(/add a new game/i);
      expect(addButtons).toHaveLength(1);
      
      // Verify it's in the header
      expect(addButtons[0].closest('.stage-section__header')).not.toBeNull();
    });

    it('shows inline Add Game button in empty state (big button)', () => {
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
        })
      );

      // Should show empty state text
      expect(screen.getByText(/no games/i)).toBeInTheDocument();

      // Should show big Add Game button in body (there are two buttons now, header and body)
      const addButtons = screen.getAllByTitle(/add a new game/i);
      expect(addButtons.length).toBeGreaterThan(1);
      
      const bodyButton = addButtons.find(btn => btn.closest('.stage-section__body'));
      expect(bodyButton).toBeDefined();
    });
  });

  it('allows canceling stage name edit with Escape', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
      })
    );

    fireEvent.click(screen.getByTitle(/edit the name of this tournament phase/i));
    const input = screen.getByDisplayValue('Preliminary');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByDisplayValue('New Name')).not.toBeInTheDocument();
    expect(screen.getByText('Preliminary')).toBeInTheDocument();
  });

  it('saves stage name edit with Enter', () => {
    const mockOnUpdate = vi.fn();
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
        onUpdate: mockOnUpdate,
      })
    );

    fireEvent.click(screen.getByTitle(/edit the name of this tournament phase/i));
    const input = screen.getByDisplayValue('Preliminary');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', { name: 'New Name' });
  });

  it('calls onUpdate when start time is changed', () => {
    const mockOnUpdate = vi.fn();
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
        onUpdate: mockOnUpdate,
      })
    );

    const timeInput = screen.getByLabelText(`${i18n.t('ui:label.start')}:`);
    fireEvent.change(timeInput, { target: { value: '10:30' } });

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', { startTime: '10:30' });
  });

  it('calls onUpdate when color is changed', () => {
    const mockOnUpdate = vi.fn();
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage],
        onUpdate: mockOnUpdate,
      })
    );

    const colorInput = screen.getByTitle(i18n.t('ui:tooltip.stageColor'));
    fireEvent.change(colorInput, { target: { value: '#00ff00' } });

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', { color: '#00ff00' });
  });

  it('toggles expansion when header is clicked', () => {
    renderStage(
      createDefaultProps({
        stage: sampleStage,
        allNodes: [sampleStage, sampleGame],
        isExpanded: false,
      })
    );

    const header = screen.getByText('Preliminary').closest('.stage-section__header');
    
    // Initially expanded by local state if prop is false
    expect(screen.getByText('Game 1')).toBeInTheDocument();
    
    fireEvent.click(header!);
    // Now it should be collapsed
    expect(screen.queryByText('Game 1')).not.toBeInTheDocument();
  });

  describe('Stage Type and Focus refinements', () => {
    it('shows Ranking Stage badge when stage type is RANKING', () => {
      const rankingStage: StageNode = {
        ...sampleStage,
        data: {
          ...sampleStage.data,
          stageType: 'RANKING',
        },
      };

      renderStage(
        createDefaultProps({
          stage: rankingStage,
          allNodes: [rankingStage],
        })
      );

      expect(screen.getByText(i18n.t('domain:stageTypeRanking'))).toBeInTheDocument();
    });

    it('allows changing stage type in edit mode', () => {
      const mockOnUpdate = vi.fn();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onUpdate: mockOnUpdate,
        })
      );

      // Enter edit mode
      fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

      // Select Ranking Stage
      const typeSelect = screen.getByLabelText(`${i18n.t('ui:label.type')}:`);
      fireEvent.change(typeSelect, { target: { value: 'RANKING' } });

      // Click Save
      fireEvent.click(screen.getByTitle(i18n.t('ui:button.save')));

      expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', {
        stageType: 'RANKING',
      });
    });

    it('Smart Blur: does not close edit mode when clicking on type selector', () => {
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
        })
      );

      // Enter edit mode
      fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));
      expect(screen.getByDisplayValue('Preliminary')).toBeInTheDocument();

      // Click on type select - should not close edit mode
      const typeSelect = screen.getByLabelText(`${i18n.t('ui:label.type')}:`);
      const nameInput = screen.getByDisplayValue('Preliminary');
      
      // Simulate blur with relatedTarget being the select
      fireEvent.blur(nameInput, { relatedTarget: typeSelect });
      
      // Should still be in edit mode
      expect(screen.getByDisplayValue('Preliminary')).toBeInTheDocument();
    });

    it('Smart Blur: closes edit mode when clicking outside the edit zone', () => {
      const mockOnUpdate = vi.fn();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onUpdate: mockOnUpdate,
        })
      );

      // Enter edit mode
      fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));
      const nameInput = screen.getByDisplayValue('Preliminary');

      // Simulate blur with relatedTarget being null (e.g. clicking body)
      fireEvent.blur(nameInput);

      // Should have exited edit mode
      expect(screen.queryByDisplayValue('Preliminary')).not.toBeInTheDocument();
      expect(mockOnUpdate).not.toHaveBeenCalled(); // No change made
    });

    it('handleSaveEdit: saves both name and stage type changes', () => {
      const mockOnUpdate = vi.fn();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onUpdate: mockOnUpdate,
        })
      );

      // Enter edit mode
      fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

      // Change name
      const input = screen.getByDisplayValue('Preliminary');
      fireEvent.change(input, { target: { value: 'New Name' } });

      // Change type
      const typeSelect = screen.getByLabelText(`${i18n.t('ui:label.type')}:`);
      fireEvent.change(typeSelect, { target: { value: 'RANKING' } });

      // Click Save
      fireEvent.click(screen.getByTitle(i18n.t('ui:button.save')));

      expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', {
        name: 'New Name',
        stageType: 'RANKING',
      });
    });

    it('handleSaveEdit: does not call onUpdate if nothing changed', () => {
      const mockOnUpdate = vi.fn();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onUpdate: mockOnUpdate,
        })
      );

      // Enter edit mode
      fireEvent.click(screen.getByTitle(i18n.t('ui:tooltip.editStageName')));

      // Click Save without changing anything
      fireEvent.click(screen.getByTitle(i18n.t('ui:button.save')));

      expect(mockOnUpdate).not.toHaveBeenCalled();
      expect(screen.queryByDisplayValue('Preliminary')).not.toBeInTheDocument();
    });
  });

  describe('Merge into...', () => {
    const otherField = { id: 'field-2', type: 'field' as const, position: { x: 0, y: 0 }, data: { type: 'field' as const, name: 'Feld 2', order: 1 } };
    const otherStage: StageNode = {
      id: 'stage-2',
      type: 'stage',
      parentId: 'field-2',
      position: { x: 0, y: 0 },
      data: { type: 'stage', name: 'Final', category: 'final', stageType: 'STANDARD', order: 0 },
    };

    it('renders merge targets grouped by field', async () => {
      const user = userEvent.setup();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, otherField, otherStage],
          onMergeStage: vi.fn(),
        })
      );

      await user.click(screen.getByTestId('merge-stage-toggle-stage-1'));

      expect(screen.getByTestId('merge-stage-target-stage-2')).toBeInTheDocument();
      expect(screen.getByText('Feld 2')).toBeInTheDocument();
    });

    it('calls onMergeStage with this stage as source and the picked stage as target', async () => {
      const user = userEvent.setup();
      const mockOnMergeStage = vi.fn();
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, otherField, otherStage],
          onMergeStage: mockOnMergeStage,
        })
      );

      await user.click(screen.getByTestId('merge-stage-toggle-stage-1'));
      await user.click(screen.getByTestId('merge-stage-target-stage-2'));

      expect(mockOnMergeStage).toHaveBeenCalledWith('stage-1', 'stage-2');
    });

    it('is disabled when there are no other stages to merge with', () => {
      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage],
          onMergeStage: vi.fn(),
        })
      );

      expect(screen.getByTestId('merge-stage-toggle-stage-1')).toBeDisabled();
    });

    it('is hidden when onMergeStage is not provided, and in read-only mode', () => {
      const { unmount } = renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, otherField, otherStage],
        })
      );
      expect(screen.queryByTestId('merge-stage-toggle-stage-1')).not.toBeInTheDocument();
      unmount();

      renderStage(
        createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, otherField, otherStage],
          onMergeStage: vi.fn(),
          readOnly: true,
        })
      );
      expect(screen.queryByTestId('merge-stage-toggle-stage-1')).not.toBeInTheDocument();
    });
  });
});
