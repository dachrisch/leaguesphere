/**
 * StageSection Swiss Progress Tests (Task 5, TDD RED phase)
 *
 * Per-round Progress/Generate button in the designer canvas for Swiss Round
 * Stages (`swiss-round-{n}`, progressionMode 'swiss').
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import type { StageSectionProps } from '../StageSection';
import FieldSection from '../FieldSection';
import type { FieldSectionProps } from '../FieldSection';
import { GamedayProvider } from '../../../context/GamedayContext';
import type { StageNode, FieldNode, SwissTournamentState } from '../../../types/flowchart';

const makeSwissStage = (round: number): StageNode => ({
  id: `swiss-round-${round}`,
  type: 'stage',
  parentId: 'field-1',
  position: { x: 0, y: 0 },
  data: {
    type: 'stage',
    name: `Round ${round}`,
    category: 'preliminary',
    stageType: 'STANDARD',
    order: round - 1,
    progressionMode: 'swiss',
    progressionConfig: { mode: 'swiss', rounds: 3, seedOrder: [], byePoints: 2 },
  },
});

const makeManualStage = (): StageNode => ({
  id: 'stage-manual',
  type: 'stage',
  parentId: 'field-1',
  position: { x: 0, y: 0 },
  data: {
    type: 'stage',
    name: 'Preliminary',
    category: 'preliminary',
    stageType: 'STANDARD',
    order: 0,
    progressionMode: 'manual',
    progressionConfig: { mode: 'manual' },
  },
});

const sampleField: FieldNode = {
  id: 'field-1',
  type: 'field',
  position: { x: 0, y: 0 },
  data: { type: 'field', name: 'Feld 1', order: 0 },
};

const createStageProps = (overrides: Partial<StageSectionProps> = {}): StageSectionProps => ({
  stage: makeSwissStage(2),
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
  onAddGameToGameEdge: vi.fn(),
  onAddStageToGameEdge: vi.fn(),
  onRemoveEdgeFromSlot: vi.fn(),
  onOpenResultModal: vi.fn(),
  onDynamicReferenceClick: vi.fn(),
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

const makeSwissState = (completed: number): SwissTournamentState => ({
  seedOrder: [1, 2, 3, 4],
  rounds: 3,
  fields: 2,
  gameDuration: 30,
  roundStartTimes: {},
  completedRounds: Array.from({ length: completed }, (_, i) => ({
    round: i + 1,
    gameIds: [i * 2 + 1, i * 2 + 2],
    bye: null,
  })),
  byes: {},
});

describe('StageSection Swiss Progress button', () => {
  it('generatable status renders button swiss-progress-{round} and click calls onProgress', () => {
    const onProgress = vi.fn();
    renderStage(
      createStageProps({
        swiss: { roundNumber: 2, status: 'generatable', onProgress },
      })
    );

    const button = screen.getByTestId('swiss-progress-2');
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('waiting status renders inline hint and disabled button', () => {
    const onProgress = vi.fn();
    renderStage(
      createStageProps({
        swiss: { roundNumber: 3, status: 'waiting', onProgress },
      })
    );

    // Inline hint visible in the stage header — not just a toast
    expect(screen.getByTestId('swiss-progress-hint-3')).toBeInTheDocument();
    const button = screen.getByTestId('swiss-progress-3');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('complete status renders no button', () => {
    renderStage(
      createStageProps({
        stage: makeSwissStage(1),
        swiss: { roundNumber: 1, status: 'complete', onProgress: vi.fn() },
      })
    );

    expect(screen.queryByTestId('swiss-progress-1')).not.toBeInTheDocument();
  });

  it('non-swiss stage renders no button', () => {
    renderStage(createStageProps({ stage: makeManualStage() }));

    expect(screen.queryByTestId(/swiss-progress-/)).not.toBeInTheDocument();
  });

  it('readOnly hides the button', () => {
    renderStage(
      createStageProps({
        readOnly: true,
        swiss: { roundNumber: 2, status: 'generatable', onProgress: vi.fn() },
      })
    );

    expect(screen.queryByTestId('swiss-progress-2')).not.toBeInTheDocument();
  });
});

describe('FieldSection Swiss status derivation', () => {
  const createFieldProps = (
    overrides: Partial<FieldSectionProps> = {}
  ): FieldSectionProps => ({
    field: sampleField,
    stages: [makeSwissStage(1), makeSwissStage(2), makeSwissStage(3)],
    allNodes: [sampleField, makeSwissStage(1), makeSwissStage(2), makeSwissStage(3)],
    edges: [],
    globalTeams: [],
    globalTeamGroups: [],
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddStage: vi.fn(),
    onSelectNode: vi.fn(),
    onHighlightElement: vi.fn(),
    selectedNodeId: null,
    onAssignTeam: vi.fn(),
    onSwapTeams: vi.fn(),
    onAddGame: vi.fn(),
    onAddGameToGameEdge: vi.fn(),
    onAddStageToGameEdge: vi.fn(),
    onRemoveEdgeFromSlot: vi.fn(),
    onOpenResultModal: vi.fn(),
    isExpanded: true,
    expandedStageIds: new Set<string>(),
    highlightedSourceGameId: null,
    onDynamicReferenceClick: vi.fn(),
    ...overrides,
  });

  it('next round (completedRounds+1) is generatable, later rounds wait, past rounds complete', () => {
    render(
      <GamedayProvider>
        <FieldSection
          {...createFieldProps({
            swiss: makeSwissState(1),
            onProgressSwissRound: vi.fn(),
          })}
        />
      </GamedayProvider>
    );

    // Round 1 done -> no button
    expect(screen.queryByTestId('swiss-progress-1')).not.toBeInTheDocument();
    // Round 2 next -> enabled button
    expect(screen.getByTestId('swiss-progress-2')).toBeEnabled();
    // Round 3 later -> disabled button + inline hint
    expect(screen.getByTestId('swiss-progress-3')).toBeDisabled();
    expect(screen.getByTestId('swiss-progress-hint-3')).toBeInTheDocument();
  });

  it('clicking the generatable button calls onProgressSwissRound with the round number', () => {
    const onProgressSwissRound = vi.fn();
    render(
      <GamedayProvider>
        <FieldSection
          {...createFieldProps({
            swiss: makeSwissState(1),
            onProgressSwissRound,
          })}
        />
      </GamedayProvider>
    );

    fireEvent.click(screen.getByTestId('swiss-progress-2'));
    expect(onProgressSwissRound).toHaveBeenCalledWith(2);
  });
});
