/**
 * Tests for handleMoveGame in useDesignerController (Issue #1921)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDesignerController } from '../useDesignerController';
import { useFlowState } from '../useFlowState';
import {
  createFieldNode,
  createStageNode,
  createGameNodeInStage,
} from '../../types/flowchart';
import type { FlowState } from '../../types/flowchart';

vi.mock('../../trackEvent', () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from '../../trackEvent';

describe('useDesignerController - handleMoveGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = () => {
    const { result } = renderHook(() => {
      const flowState = useFlowState();
      const controller = useDesignerController(undefined, flowState);
      return { flowState, controller };
    });
    return result;
  };

  const seedState = () => {
    const field1 = createFieldNode('field-1', { name: 'Feld 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Feld 2', order: 1 });
    const stage1 = createStageNode('stage-1', 'field-1', { name: 'Preliminary', order: 0 });
    const stage2 = createStageNode('stage-2', 'field-2', { name: 'Final', category: 'final', order: 0 });
    const gameA = createGameNodeInStage('game-a', 'stage-1', { standing: 'HF1' });
    const state: FlowState = {
      nodes: [field1, field2, stage1, stage2, gameA],
      edges: [],
      globalTeams: [],
      globalTeamGroups: [],
    };
    return state;
  };

  it('moves the game and notifies success', () => {
    const result = setup();

    act(() => {
      result.current.flowState.importState(seedState());
    });

    act(() => {
      result.current.controller.handlers.handleMoveGame('game-a', 'stage-2');
    });

    const movedGame = result.current.flowState.nodes.find((n) => n.id === 'game-a');
    expect(movedGame?.parentId).toBe('stage-2');

    const notifications = result.current.controller.notifications;
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[notifications.length - 1].type).toBe('success');
  });

  it('tracks the move event', () => {
    const result = setup();

    act(() => {
      result.current.flowState.importState(seedState());
    });

    act(() => {
      result.current.controller.handlers.handleMoveGame('game-a', 'stage-2');
    });

    expect(trackEvent).toHaveBeenCalledWith(
      'game_moved',
      expect.objectContaining({ game_id: 'game-a', target_stage_id: 'stage-2' })
    );
  });

  it('notifies a warning when the move is rejected', () => {
    const result = setup();

    act(() => {
      result.current.flowState.importState(seedState());
    });

    // Same stage is a rejected no-op
    act(() => {
      result.current.controller.handlers.handleMoveGame('game-a', 'stage-1');
    });

    const movedGame = result.current.flowState.nodes.find((n) => n.id === 'game-a');
    expect(movedGame?.parentId).toBe('stage-1');

    const notifications = result.current.controller.notifications;
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[notifications.length - 1].type).toBe('warning');
    expect(trackEvent).not.toHaveBeenCalledWith('game_moved', expect.anything());
  });
});
