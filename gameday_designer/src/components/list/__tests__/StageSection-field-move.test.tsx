/**
 * StageSection Component Tests - moving games between field-instances of
 * the same multi-field stage (`StageNodeData.fieldIds`), and to a stage in
 * a different field via drag & drop -- covers `onMoveGameField` and the
 * `targetFieldId` argument of `onMoveGame`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import { setDraggedGameSourceStageId, setDraggedGameSourceFieldId } from '../../../utils/dragState';
import type { StageNode, FieldNode, FlowNode, FlowEdge, GameNode, GlobalTeam, GlobalTeamGroup } from '../../../types/flowchart';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../../types/flowchart';

describe('StageSection - field-instance drop target', () => {
  let field1: FieldNode;
  let field2: FieldNode;
  let multiFieldStage: StageNode;
  let otherStage: StageNode;
  let gameOnField1: GameNode;
  let allNodes: FlowNode[];
  let mockOnMoveGame: (gameId: string, targetStageId: string, targetFieldId?: string) => void;
  let mockOnMoveGameField: (gameId: string, targetFieldId: string) => void;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
    multiFieldStage = createStageNode('stage-1', 'field-1', {
      name: 'Placement',
      order: 0,
      fieldIds: ['field-1', 'field-2'],
    });
    otherStage = createStageNode('stage-2', 'field-1', { name: 'Final', order: 1 });
    gameOnField1 = createGameNodeInStage('game-1', 'stage-1', { standing: 'G1' });
    allNodes = [field1, field2, multiFieldStage, otherStage, gameOnField1];

    mockOnMoveGame = vi.fn();
    mockOnMoveGameField = vi.fn();
    setDraggedGameSourceStageId(null);
    setDraggedGameSourceFieldId(null);
  });

  const renderField2Card = (props = {}) =>
    render(
      <GamedayProvider>
        <StageSection
          stage={multiFieldStage}
          fieldContext={field2}
          allNodes={allNodes}
          edges={[] as FlowEdge[]}
          globalTeams={[] as GlobalTeam[]}
          globalTeamGroups={[] as GlobalTeamGroup[]}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onSelectNode={vi.fn()}
          onHighlightElement={vi.fn()}
          selectedNodeId={null}
          onAssignTeam={vi.fn()}
          onSwapTeams={vi.fn()}
          onAddGame={vi.fn()}
          onAddGameToGameEdge={vi.fn()}
          onAddStageToGameEdge={vi.fn()}
          onRemoveEdgeFromSlot={vi.fn()}
          onOpenResultModal={vi.fn()}
          isExpanded={true}
          onDynamicReferenceClick={vi.fn()}
          onMoveGame={mockOnMoveGame}
          onMoveGameField={mockOnMoveGameField}
          {...props}
        />
      </GamedayProvider>
    );

  it('reassigns the field (not the stage) when a game from the same stage is dropped on another field-instance', () => {
    renderField2Card();
    const target = screen.getByTestId('stage-drop-target-stage-1');

    fireEvent.drop(target, { dataTransfer: { getData: vi.fn(() => 'game-1') } });

    expect(mockOnMoveGameField).toHaveBeenCalledWith('game-1', 'field-2');
    expect(mockOnMoveGame).not.toHaveBeenCalled();
  });

  it('is a no-op when the game is already on this field-instance', () => {
    const gameOnField2 = createGameNodeInStage('game-2', 'stage-1', { standing: 'G2', fieldId: 'field-2' });
    renderField2Card({ allNodes: [...allNodes, gameOnField2] });
    const target = screen.getByTestId('stage-drop-target-stage-1');

    fireEvent.drop(target, { dataTransfer: { getData: vi.fn(() => 'game-2') } });

    expect(mockOnMoveGameField).not.toHaveBeenCalled();
  });

  it('passes the target field-instance\'s id as onMoveGame\'s 3rd argument for a cross-stage drop', () => {
    // Drop a game from a different stage onto stage-1's field-2 card.
    const gameInOtherStage = createGameNodeInStage('game-3', 'stage-2', { standing: 'G3' });
    renderField2Card({ allNodes: [...allNodes, gameInOtherStage] });
    const target = screen.getByTestId('stage-drop-target-stage-1');

    fireEvent.drop(target, { dataTransfer: { getData: vi.fn(() => 'game-3') } });

    expect(mockOnMoveGame).toHaveBeenCalledWith('game-3', 'stage-1', 'field-2');
  });

  it('highlights the field-2 card as a drop target for a game currently on field-1 of the same stage', () => {
    setDraggedGameSourceStageId('stage-1');
    setDraggedGameSourceFieldId('field-1');
    renderField2Card();
    const target = screen.getByTestId('stage-drop-target-stage-1');

    fireEvent.dragEnter(target, { dataTransfer: { getData: vi.fn(() => 'game-1') } });

    expect(target.className).toContain('stage-drop-target');
  });

  it('shows a position/count badge and the other field\'s name for this multi-field stage card', () => {
    renderField2Card();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByTitle(i18n.t('ui:hint.multiFieldStageInstance', { otherFields: 'Field 1' }))).toBeInTheDocument();
  });
});
