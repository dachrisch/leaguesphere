import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useProgressionInspection } from '../useProgressionInspection';
import * as simulator from '../../utils/progressionSimulator';
import type { FlowNode } from '../../types/flowchart';

describe('useProgressionInspection', () => {
  it('returns an empty result and does not run the simulator when expertMode is false', () => {
    const spy = vi.spyOn(simulator, 'simulateProgression');

    const { result } = renderHook(() => useProgressionInspection(false, [], [], []));

    expect(result.current.cellsByGameId.size).toBe(0);
    expect(result.current.findings).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('runs the simulator when expertMode is true', () => {
    const gameNode: FlowNode = {
      id: 'g1',
      type: 'game',
      position: { x: 0, y: 0 },
      data: {
        type: 'game',
        stage: 'Preliminary',
        stageType: 'STANDARD',
        standing: 'Spiel 1',
        fieldId: null,
        official: null,
        breakAfter: 0,
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeTeamDynamic: null,
        awayTeamDynamic: null,
      },
    };

    const { result } = renderHook(() =>
      useProgressionInspection(true, [gameNode], [], [{ id: 't1', label: 'Team A', groupId: null, order: 0 }])
    );

    expect(result.current.cellsByGameId.get('g1')?.home.teamLabel).toBe('Team A');
  });

  it('does not recompute when inputs are unchanged (memoized)', () => {
    const nodes: FlowNode[] = [];
    const edges: never[] = [];
    const teams: never[] = [];
    const { result, rerender } = renderHook(
      ({ expertMode }) => useProgressionInspection(expertMode, nodes, edges, teams),
      { initialProps: { expertMode: true } }
    );
    const first = result.current;

    rerender({ expertMode: true });

    expect(result.current).toBe(first);
  });
});
