/**
 * StageSection Swiss round start-time tests (#1970).
 *
 * Stages materialized by the Swiss backend carry `data.swissRound`. Editing
 * the Start input of a NOT-yet-generated round posts the new time to the
 * round-times endpoint and retimes that round's placeholder games via the
 * existing game-update handler. Editing a generated round is disabled with
 * a localized hint (generated games keep their times).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageSection from '../StageSection';
import type { StageSectionProps } from '../StageSection';
import { GamedayProvider } from '../../../context/GamedayContext';
import { designerApi } from '../../../api/designerApi';
import '../../../i18n/testConfig';
import type { StageNode, GameNode } from '../../../types/flowchart';

function swissStage(id: string, round: number, field: number, startTime: string): StageNode {
  return {
    id,
    type: 'stage',
    parentId: `swiss-field-${field}`,
    position: { x: 20, y: 60 },
    data: {
      type: 'stage',
      name: `Round ${round}`,
      category: 'preliminary',
      stageType: 'STANDARD',
      order: round - 1,
      startTime,
      swissRound: round,
      swissField: field,
    },
  } as StageNode;
}

function placeholderGame(id: string, stageId: string, startTime: string): GameNode {
  return {
    id,
    type: 'game',
    parentId: stageId,
    position: { x: 30, y: 50 },
    data: {
      type: 'game',
      stage: 'Round 2',
      stageType: 'STANDARD',
      standing: 'Swiss R2-G1',
      fieldId: null,
      official: null,
      breakAfter: 0,
      homeTeamId: null,
      awayTeamId: null,
      homeTeamDynamic: null,
      awayTeamDynamic: null,
      startTime,
    },
  } as GameNode;
}

function scoredGame(id: string, stageId: string, startTime: string): GameNode {
  const game = placeholderGame(id, stageId, startTime);
  return {
    ...game,
    data: {
      ...game.data,
      homeTeamId: '138',
      awayTeamId: '522',
      final_score: { home: 10, away: 8 },
    },
  } as GameNode;
}

const createProps = (overrides: Partial<StageSectionProps> = {}): StageSectionProps => ({
  stage: swissStage('swiss-round-2-field-1', 2, 1, '10:00'),
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
  onNotify: vi.fn(),
  isExpanded: true,
  readOnly: false,
  ...overrides,
});

const renderStage = (props: StageSectionProps) =>
  render(
    <GamedayProvider>
      <StageSection {...props} />
    </GamedayProvider>,
  );

const startInput = (stageId: string) =>
  document.getElementById(`stage-start-${stageId}`) as HTMLInputElement;

describe('StageSection Swiss round start times', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the new time and retimes placeholder games for an ungenerated round', async () => {
    const onUpdate = vi.fn();
    const stage = swissStage('swiss-round-2-field-1', 2, 1, '10:00');
    const sibling = swissStage('swiss-round-2-field-2', 2, 2, '10:00');
    const placeholder = placeholderGame('swiss-r2-g1', stage.id, '10:00');
    const siblingPlaceholder = placeholderGame('swiss-r2-g2', sibling.id, '10:00');
    const played = scoredGame('swiss-r1-g1', 'swiss-round-1-field-1', '09:00');
    const playedSameRound = scoredGame('swiss-r2-g9', stage.id, '10:00');
    vi.spyOn(designerApi, 'updateSwissRoundTimes').mockResolvedValue({
      success: true,
      roundStartTimes: { '1': '09:00', '2': '10:30' },
    });

    renderStage(
      createProps({
        stage,
        allNodes: [stage, sibling, placeholder, siblingPlaceholder, played, playedSameRound],
        onUpdate,
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    fireEvent.change(startInput(stage.id), { target: { value: '10:30' } });

    await waitFor(() =>
      expect(designerApi.updateSwissRoundTimes).toHaveBeenCalledWith(42, { '2': '10:30' }),
    );
    // Stage (self + sibling) and placeholder games retimed via onUpdate.
    expect(onUpdate).toHaveBeenCalledWith(stage.id, { startTime: '10:30' });
    expect(onUpdate).toHaveBeenCalledWith(sibling.id, { startTime: '10:30' });
    expect(onUpdate).toHaveBeenCalledWith(placeholder.id, { startTime: '10:30' });
    expect(onUpdate).toHaveBeenCalledWith(siblingPlaceholder.id, { startTime: '10:30' });
    // Games that already have results keep their times.
    const playedCalls = onUpdate.mock.calls.filter(([id]) => id === played.id);
    expect(playedCalls).toHaveLength(0);
    const sameRoundPlayedCalls = onUpdate.mock.calls.filter(([id]) => id === playedSameRound.id);
    expect(sameRoundPlayedCalls).toHaveLength(0);
  });

  it('disables the Start input with a localized hint for an already-generated round', () => {
    const stage = swissStage('swiss-round-1-field-1', 1, 1, '09:00');

    renderStage(
      createProps({
        stage,
        allNodes: [stage],
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    const input = startInput(stage.id);
    expect(input).toBeDisabled();
    expect(input.title).toBe('Generated rounds keep their scheduled times');
    expect(screen.getByTestId(`swiss-round-time-hint-${stage.id}`)).toHaveTextContent(
      'Generated rounds keep their scheduled times',
    );
  });

  it('locks per-game time-pencil edits for games in a generated Swiss round', () => {
    const onUpdate = vi.fn();
    const stage = swissStage('swiss-round-1-field-1', 1, 1, '09:00');
    const game = placeholderGame('swiss-r1-g1', stage.id, '09:00');

    const { container } = renderStage(
      createProps({
        stage,
        allNodes: [stage, game],
        onUpdate,
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    // No per-game time pencil, and clicking the time opens no editor —
    // only the stage Start input (a single time input) exists.
    expect(container.querySelector('[data-testid="game-time-edit-swiss-r1-g1"]')).toBeNull();
    fireEvent.click(screen.getByText('09:00'));
    expect(container.querySelectorAll('input[type="time"]')).toHaveLength(1);
    expect(onUpdate).not.toHaveBeenCalled();
    // Team/result editing stays live: the home-team select is still enabled.
    expect(container.querySelector('.react-select__control')).toBeInTheDocument();
  });

  it('keeps per-game time-pencil edits live for an ungenerated Swiss round', () => {
    const stage = swissStage('swiss-round-2-field-1', 2, 1, '10:00');
    const game = placeholderGame('swiss-r2-g1', stage.id, '10:00');

    const { container } = renderStage(
      createProps({
        stage,
        allNodes: [stage, game],
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    expect(container.querySelector('[data-testid="game-time-edit-swiss-r2-g1"]')).not.toBeNull();
    fireEvent.click(screen.getByText('10:00'));
    // Stage Start input + the opened per-game time editor.
    expect(container.querySelectorAll('input[type="time"]')).toHaveLength(2);
  });

  it('ignores an empty Start clear for Swiss rounds (no POST, no local apply)', () => {
    const onUpdate = vi.fn();
    const updateSpy = vi.spyOn(designerApi, 'updateSwissRoundTimes');
    const stage = swissStage('swiss-round-2-field-1', 2, 1, '10:00');

    renderStage(
      createProps({
        stage,
        allNodes: [stage],
        onUpdate,
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    fireEvent.change(startInput(stage.id), { target: { value: '' } });

    // An empty round time is never valid: revert, don't POST, don't apply.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(startInput(stage.id).value).toBe('10:00');
  });

  it('notifies danger and applies nothing when the round-times POST fails', async () => {
    const onUpdate = vi.fn();
    const onNotify = vi.fn();
    vi.spyOn(designerApi, 'updateSwissRoundTimes').mockRejectedValue(new Error('nope'));
    const stage = swissStage('swiss-round-2-field-1', 2, 1, '10:00');
    const sibling = swissStage('swiss-round-2-field-2', 2, 2, '10:00');
    const placeholder = placeholderGame('swiss-r2-g1', stage.id, '10:00');
    const siblingPlaceholder = placeholderGame('swiss-r2-g2', sibling.id, '10:00');

    renderStage(
      createProps({
        stage,
        allNodes: [stage, sibling, placeholder, siblingPlaceholder],
        onUpdate,
        onNotify,
        gamedayId: 42,
        swissCompletedRounds: 1,
      }),
    );

    fireEvent.change(startInput(stage.id), { target: { value: '10:30' } });

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        'Failed to update the round start time',
        'danger',
        'Error',
      ),
    );
    // Stage + siblings + placeholders unchanged.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keeps the plain stage-time path for non-Swiss stages', () => {
    const onUpdate = vi.fn();
    const updateSpy = vi.spyOn(designerApi, 'updateSwissRoundTimes');
    const plain: StageNode = {
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
        startTime: '09:00',
      },
    };

    renderStage(createProps({ stage: plain, allNodes: [plain], onUpdate }));

    const input = startInput(plain.id);
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: '09:30' } });

    expect(onUpdate).toHaveBeenCalledWith('stage-1', { startTime: '09:30' });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
