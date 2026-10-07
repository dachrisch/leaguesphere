/**
 * useDesignerController handleClearAll with Swiss setup (#1970).
 *
 * Clearing the schedule on a Swiss gameday must FIRST reset the Swiss
 * tournament on the backend, then clear the canvas (including the swiss
 * key) and explicitly persist the cleared state. A failed reset aborts
 * with a danger notification and clears nothing. Without swiss config
 * the endpoint is skipped entirely.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDesignerController } from '../useDesignerController';
import { useFlowState } from '../useFlowState';
import { gamedayApi } from '../../api/gamedayApi';
import { designerApi } from '../../api/designerApi';
import { createFieldNode } from '../../types/flowchart';
import type {
  FlowState,
  GlobalTeam,
  GlobalTeamGroup,
  SwissTournamentState,
} from '../../types/flowchart';

vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getDesignerState: vi.fn(),
    updateDesignerState: vi.fn(),
  },
}));

vi.mock('../../api/designerApi', () => ({
  designerApi: {
    resetSwissTournament: vi.fn(),
  },
}));

const SWISS: SwissTournamentState = {
  seedOrder: [138, 522],
  rounds: 4,
  fields: 2,
  gameDuration: 30,
  roundStartTimes: { '1': '09:00', '2': '10:20' },
  completedRounds: [{ round: 1, gameIds: [101], bye: null }],
  byes: {},
};

const TEAM: GlobalTeam = { id: '138', label: 'Aachen', groupId: null, order: 0, color: '#e74c3c' };
const GROUP: GlobalTeamGroup = { id: 'group-swiss-a', name: 'Gruppe A', order: 0 };

function seedState(withSwiss: boolean): Partial<FlowState> {
  return {
    metadata: {
      id: 7,
      name: 'Swiss Gameday',
      date: '2026-05-01',
      start: '09:00',
      format: 'tournament',
      author: 1,
      address: 'Test Venue',
      season: 1,
      league: 1,
      status: 'DRAFT',
    },
    nodes: [createFieldNode('field-1', { name: 'Feld 1' })],
    edges: [],
    globalTeams: [{ ...TEAM }],
    globalTeamGroups: [{ ...GROUP }],
    ...(withSwiss ? { swiss: SWISS } : {}),
  };
}

function renderController(withSwiss: boolean) {
  return renderHook(() => {
    const flowState = useFlowState(seedState(withSwiss));
    const controller = useDesignerController('7', flowState);
    return { flowState, controller };
  });
}

describe('useDesignerController handleClearAll with Swiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gamedayApi.updateDesignerState).mockResolvedValue({ state_data: {} as FlowState });
    vi.mocked(designerApi.resetSwissTournament).mockResolvedValue({ success: true, deleted_games: 2 });
  });

  it('clear-with-swiss calls reset, clears the canvas and saves the cleared state', async () => {
    const { result } = renderController(true);

    await act(async () => {
      await result.current.controller.handlers.handleClearAll();
    });

    // Reset FIRST, then the explicit cleared-state save.
    expect(designerApi.resetSwissTournament).toHaveBeenCalledWith(7);
    expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(designerApi.resetSwissTournament).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(gamedayApi.updateDesignerState).mock.invocationCallOrder[0],
    );

    // Saved content: everything cleared, metadata preserved.
    const saved = vi.mocked(gamedayApi.updateDesignerState).mock.calls[0][1] as FlowState;
    expect(saved.nodes).toEqual([]);
    expect(saved.edges).toEqual([]);
    expect(saved.globalTeams).toEqual([]);
    expect(saved.globalTeamGroups).toEqual([]);
    expect(saved.swiss).toBeUndefined();
    expect(saved.metadata?.name).toBe('Swiss Gameday');

    // Canvas itself cleared including the swiss key.
    expect(result.current.flowState.nodes).toEqual([]);
    expect(result.current.flowState.globalTeams).toEqual([]);
    expect(result.current.flowState.swiss).toBeUndefined();
  });

  it('aborts with a danger notification and clears nothing when the reset fails', async () => {
    vi.mocked(designerApi.resetSwissTournament).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderController(true);

    await act(async () => {
      await result.current.controller.handlers.handleClearAll();
    });

    const dangers = result.current.controller.notifications.filter((n) => n.type === 'danger');
    expect(dangers).toHaveLength(1);
    expect(result.current.flowState.nodes).toHaveLength(1);
    expect(result.current.flowState.globalTeams).toHaveLength(1);
    expect(result.current.flowState.swiss).toEqual(SWISS);
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
  });

  it('clear-without-swiss makes no reset call and keeps existing behavior', async () => {
    const { result } = renderController(false);

    await act(async () => {
      await result.current.controller.handlers.handleClearAll();
    });

    expect(designerApi.resetSwissTournament).not.toHaveBeenCalled();
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
    expect(result.current.flowState.nodes).toEqual([]);
    expect(result.current.flowState.globalTeams).toEqual([]);
  });
});
