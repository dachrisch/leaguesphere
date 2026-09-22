import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlowState } from '../useFlowState';
import type { FlowState, SwissTournamentState } from '../../types/flowchart';

const SWISS: SwissTournamentState = {
  seedOrder: [11, 22, 33, 44],
  rounds: 3,
  fields: 2,
  gameDuration: 30,
  roundStartTimes: { '1': '09:00', '2': '10:20', '3': '11:40' },
  completedRounds: [{ round: 1, gameIds: [101, 102], bye: null }],
  byes: {},
};

function emptyState(): FlowState {
  return { nodes: [], edges: [], globalTeams: [], globalTeamGroups: [] };
}

describe('useFlowState swiss round-trip (#1970)', () => {
  it('preserves the swiss tournament config through import/export', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState({ ...emptyState(), swiss: SWISS });
    });

    expect(result.current.swiss).toEqual(SWISS);
    expect(result.current.exportState().swiss).toEqual(SWISS);
  });

  it('keeps swiss intact when canvas nodes change after import', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState({ ...emptyState(), swiss: SWISS });
    });
    act(() => {
      result.current.addFieldNode();
    });

    expect(result.current.exportState().swiss).toEqual(SWISS);
  });

  it('leaves swiss undefined for gamedays without a Swiss setup', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState(emptyState());
    });

    expect(result.current.swiss).toBeUndefined();
    expect(result.current.exportState().swiss).toBeUndefined();
  });

  it('accepts swiss config via initial state', () => {
    const { result } = renderHook(() => useFlowState({ ...emptyState(), swiss: SWISS }));

    expect(result.current.swiss).toEqual(SWISS);
  });

  it('preserves existing swiss when the imported payload lacks the swiss key', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState({ ...emptyState(), swiss: SWISS });
    });
    act(() => {
      result.current.importState(emptyState());
    });

    expect(result.current.swiss).toEqual(SWISS);
    expect(result.current.exportState().swiss).toEqual(SWISS);
  });

  it('takes the new swiss config when the imported payload includes the swiss key', () => {
    const NEXT: SwissTournamentState = {
      ...SWISS,
      rounds: 4,
      completedRounds: [
        ...SWISS.completedRounds,
        { round: 2, gameIds: [201, 202], bye: null },
      ],
    };
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState({ ...emptyState(), swiss: SWISS });
    });
    act(() => {
      result.current.importState({ ...emptyState(), swiss: NEXT });
    });

    expect(result.current.swiss).toEqual(NEXT);
  });

  it('clears the swiss config on clearAll (no-op for non-Swiss)', () => {
    const { result } = renderHook(() => useFlowState());

    act(() => {
      result.current.importState({ ...emptyState(), swiss: SWISS });
    });
    expect(result.current.swiss).toEqual(SWISS);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.swiss).toBeUndefined();
    expect(result.current.exportState().swiss).toBeUndefined();
  });
});
