/**
 * StageSection Component Tests
 *
 * Tests for the stage section component that displays a collapsible stage container
 * with nested team and game tables in the list-based UI.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import type { StageNode, GameNode, TeamNode } from '../../../types/flowchart';
import type { StageSectionProps } from '../StageSection';

// Helper function to create default props
const createDefaultProps = (overrides: Partial<StageSectionProps> = {}): StageSectionProps => ({
  stage: {} as StageNode,
  allNodes: [],
  edges: [],
  globalTeams: [],
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onSelectNode: vi.fn(),
  selectedNodeId: null,
  onAssignTeam: vi.fn(),
  onAddGame: vi.fn(),
  highlightedSourceGameId: null,
  onDynamicReferenceClick: vi.fn(),
  onAddGameToGameEdge: vi.fn(),
  onRemoveGameToGameEdge: vi.fn(),
  isExpanded: true,
  ...overrides,
});

describe('StageSection', () => {
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

  // Sample team node
  const sampleTeam: TeamNode = {
    id: 'team-1',
    type: 'team',
    parentId: 'stage-1',
    position: { x: 0, y: 0 },
    data: {
      type: 'team',
      reference: { type: 'groupTeam', group: 1, team: 1 },
      label: '1_1',
    },
  };

  it('renders stage with name and type badge', () => {
    render(
      <StageSection
        {...createDefaultProps({
          stage: sampleStage,
          allNodes: [sampleStage, sampleGame, sampleTeam],
        })}
      />
    );

    // Stage name should be visible
    expect(screen.getByText('Vorrunde')).toBeInTheDocument();

    // Stage type badge should be visible
    expect(screen.getByText('vorrunde')).toBeInTheDocument();

    // Game count should be visible
    expect(screen.getByText(/1 game/i)).toBeInTheDocument();

    // Team count should be visible
    expect(screen.getByText(/1 team/i)).toBeInTheDocument();
  });

  it('toggles expansion when header is clicked', () => {
    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage, sampleGame, sampleTeam]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Should be expanded by default - look for table headers
    expect(screen.getByText(/Standing/i)).toBeInTheDocument();

    // Click to collapse
    const header = screen.getByText('Vorrunde');
    fireEvent.click(header);

    // Tables should be hidden
    expect(screen.queryByText(/Standing/i)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(header);

    // Tables should be visible again
    expect(screen.getByText(/Standing/i)).toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked with confirmation', () => {
    const mockOnDelete = vi.fn();
    window.confirm = vi.fn(() => true);

    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={mockOnDelete}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete stage/i });
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockOnDelete).toHaveBeenCalledWith('stage-1');
  });

  it('does not call onDelete when confirmation is cancelled', () => {
    const mockOnDelete = vi.fn();
    window.confirm = vi.fn(() => false);

    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={mockOnDelete}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete stage/i });
    fireEvent.click(deleteButton);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it('highlights stage when selected', () => {
    const { container } = render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId="stage-1"
      />
    );

    const stageCard = container.querySelector('.stage-section');
    expect(stageCard).toHaveClass('selected');
  });

  it('shows correct stage type badge for different stage types', () => {
    const finalrundeStage: StageNode = {
      ...sampleStage,
      data: {
        ...sampleStage.data,
        name: 'Finalrunde',
        stageType: 'finalrunde',
      },
    };

    render(
      <StageSection
        stage={finalrundeStage}
        allNodes={[finalrundeStage]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    expect(screen.getByText('finalrunde')).toBeInTheDocument();
  });

  it('allows inline editing of stage name', () => {
    const mockOnUpdate = vi.fn();

    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage]}
        edges={[]}
        onUpdate={mockOnUpdate}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    const nameElement = screen.getByText('Vorrunde');
    fireEvent.doubleClick(nameElement);

    const input = screen.getByDisplayValue('Vorrunde');
    fireEvent.change(input, { target: { value: 'Neue Vorrunde' } });
    fireEvent.blur(input);

    expect(mockOnUpdate).toHaveBeenCalledWith('stage-1', {
      name: 'Neue Vorrunde',
    });
  });

  it('displays separate sections for teams and games', () => {
    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage, sampleGame, sampleTeam]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Should have team table section
    expect(screen.getByText(/Teams/i)).toBeInTheDocument();

    // Should have game table section
    expect(screen.getByText(/Games/i)).toBeInTheDocument();
  });

  it('shows empty state when stage has no games or teams', () => {
    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Should show empty states
    expect(screen.getByText(/no teams/i)).toBeInTheDocument();
    expect(screen.getByText(/no games/i)).toBeInTheDocument();
  });

  it('counts only games and teams in this stage', () => {
    // Create nodes from a different stage
    const otherGame: GameNode = {
      ...sampleGame,
      id: 'game-2',
      parentId: 'stage-2',
    };

    const otherTeam: TeamNode = {
      ...sampleTeam,
      id: 'team-2',
      parentId: 'stage-2',
    };

    render(
      <StageSection
        stage={sampleStage}
        allNodes={[sampleStage, sampleGame, sampleTeam, otherGame, otherTeam]}
        edges={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={null}
      />
    );

    // Should count only this stage's games and teams
    expect(screen.getByText(/1 game/i)).toBeInTheDocument();
    expect(screen.getByText(/1 team/i)).toBeInTheDocument();
  });
});
