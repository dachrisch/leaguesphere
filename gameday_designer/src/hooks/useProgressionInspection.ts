import { useMemo } from 'react';
import type { FlowNode, FlowEdge, GlobalTeam } from '../types/flowchart';
import type { ProgressionSimulationResult } from '../types/progression';
import { createEmptyProgressionSimulationResult } from '../types/progression';
import { simulateProgression } from '../utils/progressionSimulator';

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
  return useMemo(() => {
    if (!expertMode) return createEmptyProgressionSimulationResult();
    return simulateProgression(nodes, edges, globalTeams);
  }, [expertMode, nodes, edges, globalTeams]);
}
