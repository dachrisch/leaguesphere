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

  it('returns a referentially stable empty result across renders when off, even as nodes change', () => {
    // Regression test: nodes/edges get new array identities on nearly every
    // designer edit. When Expert Mode is off, the result (and its
    // cellsByGameId Map) must still be the SAME object reference every time,
    // or downstream React.memo'd components (FieldSection, StageSection,
    // GameTable) re-render on every edit for users who never opted in.
    const { result, rerender } = renderHook(
      ({ nodes }: { nodes: FlowNode[] }) => useProgressionInspection(false, nodes, [], []),
      { initialProps: { nodes: [] } }
    );
    const first = result.current;
    const firstCells = first.cellsByGameId;

    rerender({ nodes: [] }); // a brand-new array reference, same (empty) content

    expect(result.current).toBe(first);
    expect(result.current.cellsByGameId).toBe(firstCells);
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
