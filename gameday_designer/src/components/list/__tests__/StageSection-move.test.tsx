/**
 * StageSection Component Tests - Move Game drop target (Issue #1921)
 *
 * Covers drag & drop of games onto a stage header to move them
 * into that stage (and field).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import type {
  StageNode,
  FlowNode,
  FlowEdge,
  GameNode,
  GlobalTeam,
  GlobalTeamGroup,
  HighlightedElement,
} from '../../../types/flowchart';
import type { NotificationType } from '../../../types/designer';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../../types/flowchart';

describe('StageSection - move game drop target', () => {
  let stage1: StageNode;
  let stage2: StageNode;
  let allNodes: FlowNode[];
  let game1: GameNode;

  let mockOnUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  let mockOnDelete: (nodeId: string) => void;
  let mockOnSelectNode: (nodeId: string | null) => void;
  let mockOnHighlightElement: (id: string, type: HighlightedElement['type']) => void;
  let mockOnAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  let mockOnSwapTeams: (gameId: string) => void;
  let mockOnAddGame: (stageId: string) => void;
  let mockOnAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  let mockOnAddStageToGameEdge: (sourceStageId: string, sourceRank: number, targetGameId: string, targetSlot: 'home' | 'away', sourceGroup?: string) => void;
  let mockOnRemoveEdgeFromSlot: (targetGameId: string, targetSlot: 'home' | 'away') => void;
  let mockOnOpenResultModal: (gameId: string) => void;
  let mockOnDynamicReferenceClick: (sourceGameId: string) => void;
  let mockOnNotify: (message: string, type: NotificationType, title?: string) => void;
  let mockOnMoveGame: (gameId: string, targetStageId: string) => void;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();

    const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    stage1 = createStageNode('stage-1', 'field-1', { name: 'Preliminary', category: 'preliminary', order: 0 });
    stage2 = createStageNode('stage-2', 'field-1', { name: 'Final', category: 'final', order: 1 });
    game1 = createGameNodeInStage('game-1', 'stage-2', { standing: 'Quali 1', stage: 'Final' });
    allNodes = [field1, stage1, stage2, game1];

    mockOnUpdate = vi.fn();
    mockOnDelete = vi.fn();
    mockOnSelectNode = vi.fn();
    mockOnHighlightElement = vi.fn();
    mockOnAssignTeam = vi.fn();
    mockOnSwapTeams = vi.fn();
    mockOnAddGame = vi.fn();
    mockOnAddGameToGameEdge = vi.fn();
    mockOnAddStageToGameEdge = vi.fn();
    mockOnRemoveEdgeFromSlot = vi.fn();
    mockOnOpenResultModal = vi.fn();
    mockOnDynamicReferenceClick = vi.fn();
    mockOnNotify = vi.fn();
    mockOnMoveGame = vi.fn();
  });

  const renderSection = (props = {}) => {
    return render(
      <GamedayProvider>
        <StageSection
          stage={stage1}
          allNodes={allNodes}
          edges={[] as FlowEdge[]}
          globalTeams={[] as GlobalTeam[]}
          globalTeamGroups={[] as GlobalTeamGroup[]}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onSelectNode={mockOnSelectNode}
          onHighlightElement={mockOnHighlightElement}
          selectedNodeId={null}
          onAssignTeam={mockOnAssignTeam}
          onSwapTeams={mockOnSwapTeams}
          onAddGame={mockOnAddGame}
          onAddGameToGameEdge={mockOnAddGameToGameEdge}
          onAddStageToGameEdge={mockOnAddStageToGameEdge}
          onRemoveEdgeFromSlot={mockOnRemoveEdgeFromSlot}
          onOpenResultModal={mockOnOpenResultModal}
          isExpanded={true}
          onDynamicReferenceClick={mockOnDynamicReferenceClick}
          onNotify={mockOnNotify}
          onMoveGame={mockOnMoveGame}
          {...props}
        />
      </GamedayProvider>
    );
  };

  const getDropTarget = () => screen.getByTestId('stage-drop-target-stage-1');

  it('marks the stage as a drop target', () => {
    renderSection();
    expect(getDropTarget()).toBeInTheDocument();
    expect(getDropTarget()).toHaveAttribute('title', i18n.t('ui:tooltip.dropToMove'));
  });

  it('accepts a dragged game and calls onMoveGame', () => {
    renderSection();
    const target = getDropTarget();

    fireEvent.dragOver(target, {
      dataTransfer: { dropEffect: null, getData: vi.fn(() => '') },
    });
    fireEvent.drop(target, {
      dataTransfer: { getData: vi.fn(() => 'game-1') },
    });

    expect(mockOnMoveGame).toHaveBeenCalledWith('game-1', 'stage-1');
  });

  it('prevents default on dragOver to allow dropping', () => {
    renderSection();
    const target = getDropTarget();

    // dispatchEvent returns false when the event was canceled (preventDefault called)
    const canceled = fireEvent.dragOver(target, {
      dataTransfer: { dropEffect: null, getData: vi.fn(() => '') },
    });
    expect(canceled).toBe(false);
  });

  it('ignores drops of games already in this stage', () => {
    const gameInStage1 = createGameNodeInStage('game-inside', 'stage-1', { standing: 'X1' });
    renderSection({ allNodes: [...allNodes, gameInStage1] });
    const target = getDropTarget();

    fireEvent.drop(target, {
      dataTransfer: { getData: vi.fn(() => 'game-inside') },
    });

    expect(mockOnMoveGame).not.toHaveBeenCalled();
  });

  it('ignores drops without a game id', () => {
    renderSection();
    const target = getDropTarget();

    fireEvent.drop(target, {
      dataTransfer: { getData: vi.fn(() => '') },
    });

    expect(mockOnMoveGame).not.toHaveBeenCalled();
  });

  it('does not accept drops in read-only mode', () => {
    renderSection({ readOnly: true });
    const target = getDropTarget();

    // dragOver is not canceled in read-only mode (not a valid drop target)
    const canceled = fireEvent.dragOver(target, {
      dataTransfer: { dropEffect: null, getData: vi.fn(() => '') },
    });
    expect(canceled).toBe(true);
    fireEvent.drop(target, {
      dataTransfer: { getData: vi.fn(() => 'game-1') },
    });

    expect(mockOnMoveGame).not.toHaveBeenCalled();
  });

  it('highlights the stage while a game is dragged over it', () => {
    renderSection();
    const target = getDropTarget();

    fireEvent.dragEnter(target, {
      dataTransfer: { getData: vi.fn(() => 'game-1') },
    });
    expect(target.className).toContain('stage-drop-target');

    fireEvent.dragLeave(target, {
      dataTransfer: { getData: vi.fn(() => 'game-1') },
    });
    expect(target.className).not.toContain('stage-drop-target');
  });
});
