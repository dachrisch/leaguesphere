/**
 * GameTable Component Tests - Move Game (Issue #1921)
 *
 * Covers the per-game move dropdown (context menu) for relocating a game
 * to another stage/field and the drag source on game rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import GameTable from '../GameTable';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import type { GameNode, StageNode, FieldNode, GlobalTeam, GlobalTeamGroup, FlowEdge, HighlightedElement } from '../../../types/flowchart';
import type { NotificationType } from '../../../types/designer';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../../types/flowchart';

describe('GameTable - move game', () => {
  let field1: FieldNode;
  let field2: FieldNode;
  let stage1: StageNode;
  let stage2: StageNode;
  let stage3: StageNode;
  let game1: GameNode;
  let team1: GlobalTeam;
  let teamGroup1: GlobalTeamGroup;

  let mockOnUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  let mockOnDelete: (nodeId: string) => void;
  let mockOnSelectNode: (nodeId: string | null) => void;
  let mockOnHighlightElement: (id: string, type: HighlightedElement['type']) => void;
  let mockOnOpenResultModal: (gameId: string) => void;
  let mockOnAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  let mockOnAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  let mockOnAddStageToGameEdge: (sourceStageId: string, sourceRank: number, targetGameId: string, targetSlot: 'home' | 'away', sourceGroup?: string) => void;
  let mockOnRemoveEdgeFromSlot: (targetGameId: string, targetSlot: 'home' | 'away') => void;
  let mockOnDynamicReferenceClick: (sourceGameId: string) => void;
  let mockOnNotify: (message: string, type: NotificationType, title?: string) => void;
  let mockOnSwapTeams: (gameId: string) => void;
  let mockOnMoveGame: (gameId: string, targetStageId: string) => void;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
    stage1 = createStageNode('stage-1', 'field-1', { name: 'Preliminary', category: 'preliminary', order: 0 });
    stage2 = createStageNode('stage-2', 'field-1', { name: 'Final', category: 'final', order: 1 });
    stage3 = createStageNode('stage-3', 'field-2', { name: 'Placement', category: 'placement', order: 0 });

    game1 = createGameNodeInStage('game-1', 'stage-1', { standing: 'Quali 1', stage: 'Preliminary' });

    teamGroup1 = { id: 'group-1', name: 'Group A', order: 0 };
    team1 = { id: 'team-1', label: 'Team A', groupId: 'group-1', order: 0 };

    mockOnUpdate = vi.fn();
    mockOnDelete = vi.fn();
    mockOnSelectNode = vi.fn();
    mockOnHighlightElement = vi.fn();
    mockOnOpenResultModal = vi.fn();
    mockOnAssignTeam = vi.fn();
    mockOnAddGameToGameEdge = vi.fn();
    mockOnAddStageToGameEdge = vi.fn();
    mockOnRemoveEdgeFromSlot = vi.fn();
    mockOnDynamicReferenceClick = vi.fn();
    mockOnNotify = vi.fn();
    mockOnSwapTeams = vi.fn();
    mockOnMoveGame = vi.fn();
  });

  const renderTable = (props = {}) => {
    return render(
      <GamedayProvider>
        <GameTable
          games={[game1]}
          edges={[] as FlowEdge[]}
          allNodes={[field1, field2, stage1, stage2, stage3, game1]}
          globalTeams={[team1]}
          globalTeamGroups={[teamGroup1]}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onSelectNode={mockOnSelectNode}
          onHighlightElement={mockOnHighlightElement}
          selectedNodeId={null}
          onAssignTeam={mockOnAssignTeam}
          onSwapTeams={mockOnSwapTeams}
          onAddGameToGameEdge={mockOnAddGameToGameEdge}
          onAddStageToGameEdge={mockOnAddStageToGameEdge}
          onRemoveEdgeFromSlot={mockOnRemoveEdgeFromSlot}
          onOpenResultModal={mockOnOpenResultModal}
          onDynamicReferenceClick={mockOnDynamicReferenceClick}
          onNotify={mockOnNotify}
          onMoveGame={mockOnMoveGame}
          {...props}
        />
      </GamedayProvider>
    );
  };

  it('renders a move button for each game row', () => {
    renderTable();
    expect(screen.getByTestId('move-game-game-1')).toBeInTheDocument();
  });

  it('lists target stages grouped by field, excluding the current stage', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByTestId('move-game-game-1'));

    // Other stages of the same field and stages of other fields are offered
    expect(screen.getByTestId('move-target-stage-2')).toBeInTheDocument();
    expect(screen.getByTestId('move-target-stage-3')).toBeInTheDocument();
    expect(screen.getByText('Field 2')).toBeInTheDocument();
    // The game's own stage is not offered
    expect(screen.queryByTestId('move-target-stage-1')).not.toBeInTheDocument();
  });

  it('calls onMoveGame with the game id and target stage id', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByTestId('move-game-game-1'));
    await user.click(screen.getByTestId('move-target-stage-3'));

    expect(mockOnMoveGame).toHaveBeenCalledWith('game-1', 'stage-3');
  });

  it('disables the move button when there are no other stages', () => {
    renderTable({ allNodes: [field1, stage1, game1] });
    expect(screen.getByTestId('move-game-game-1')).toBeDisabled();
  });

  it('shows a hint when there are no other stages', () => {
    renderTable({ allNodes: [field1, stage1, game1] });
    expect(screen.getByTitle(i18n.t('ui:message.noMoveTargets'))).toBeInTheDocument();
  });

  it('does not render the move button in read-only mode', () => {
    renderTable({ readOnly: true });
    expect(screen.queryByTestId('move-game-game-1')).not.toBeInTheDocument();
  });

  it('game rows act as drag sources carrying the game id', () => {
    renderTable();
    const row = screen.getByRole('row', { name: /Quali 1/i });
    expect(row).toHaveAttribute('draggable', 'true');

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: null } });
    expect(setData).toHaveBeenCalledWith('text/plain', 'game-1');
  });
});
