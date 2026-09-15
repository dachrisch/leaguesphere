import { useMemo } from 'react';
import type { FlowNode, FlowEdge, GlobalTeam } from '../types/flowchart';
import type { ProgressionSimulationResult } from '../types/progression';
import { createEmptyProgressionSimulationResult } from '../types/progression';
import { simulateProgression } from '../utils/progressionSimulator';

/**
 * Module-level singleton, not `createEmptyProgressionSimulationResult()`
 * called fresh inside the hook: when Expert Mode is off, this exact object
 * (and its `cellsByGameId` Map) must keep the SAME identity across renders.
 * `nodes`/`edges` change on nearly every designer edit, and `progression`/
 * `progressionByGameId` are threaded as props all the way down through
 * `ListCanvas` → `FieldSection` → `StageSection` → `GameTable`, each wrapped
 * in `React.memo` — a fresh empty object every render would bust that
 * memoization for every user, including the ones who never opted into
 * Expert Mode at all.
 */
const EMPTY_RESULT: ProgressionSimulationResult = createEmptyProgressionSimulationResult();

/**
 * Computes the Expert-Mode Progression Inspector's simulation result.
 *
 * Only actually runs the simulation when `expertMode` is true, so normal
 * users pay zero runtime cost — see `progressionSimulator.ts` for the engine
 * and `src/types/progression.ts` for why this stays a fully separate value
 * from `useFlowValidation`'s result rather than being merged into it (that
 * separation is what keeps expert-mode findings structurally unable to
 * affect save/export gating).
 */
export function useProgressionInspection(
  expertMode: boolean,
  nodes: FlowNode[],
  edges: FlowEdge[],
  globalTeams: GlobalTeam[]
): ProgressionSimulationResult {
  const computed = useMemo(() => {
    if (!expertMode) return null;
    return simulateProgression(nodes, edges, globalTeams);
  }, [expertMode, nodes, edges, globalTeams]);

  return computed ?? EMPTY_RESULT;
}
