/**
 * Progression Simulation Types (Expert Mode)
 *
 * Types for the "Progression Inspector" — an expert-mode-only, client-side
 * simulation of how the current bracket/schedule graph would resolve if
 * played to completion. This traces `winner`/`loser`/`rank`/`groupRank`
 * TeamReferences end-to-end through the graph, distinguishing results that
 * already happened (`basis: 'actual'`) from hypothetical projections for
 * games that haven't been played yet (`basis: 'projected'`).
 *
 * Deliberately NOT merged into `FlowValidationResult`/`FlowValidationErrorType`/
 * `FlowValidationWarningType` (see `useFlowValidation.ts`): this is a separate,
 * always-non-blocking, expert-mode-only surface. See `progressionSimulator.ts`
 * for the resolution engine and `useProgressionInspection.ts` for the hook
 * that gates computation on the expert-mode toggle.
 */

/**
 * Types of expert-mode-only correctness findings the simulator can report.
 * None of these ever feed into save/export gating — see `progressionSimulator.ts`.
 */
export type ProgressionFindingType =
  | 'dangling_reference'
  | 'unreachable_placeholder'
  | 'unresolved_cycle'
  | 'undecided_tie'
  | 'reference_mismatch'
  | 'ambiguous_standing';

/**
 * A single expert-mode finding. Purely observational — see module docstring.
 */
export interface ProgressionFinding {
  /** Unique identifier for this finding */
  id: string;
  /** Type of finding */
  type: ProgressionFindingType;
  /** Human-readable message */
  message: string;
  /** Translation key, following the `messageKey`/`messageParams` pattern used by FlowValidationWarning */
  messageKey?: string;
  /** Parameters for the translation key */
  messageParams?: Record<string, unknown>;
  /** IDs of affected nodes (games/stages), for click-to-highlight */
  affectedNodes: string[];
}

/** Whether a resolved slot reflects an actually-played result, or a hypothetical projection. */
export type ResolutionBasis = 'actual' | 'projected';

/**
 * The simulated outcome of a single home/away/official slot on a game.
 * `teamLabel` is null when the slot could not be resolved (dangling reference,
 * unresolved cycle, or simply not wired up yet).
 */
export interface ResolvedSlot {
  teamLabel: string | null;
  basis: ResolutionBasis | null;
  /** The game node that produced this value, when resolved via a winner/loser reference */
  sourceGameId?: string;
  /** The stage node that produced this value, when resolved via a rank/groupRank reference */
  sourceStageId?: string;
}

/**
 * The full simulated result for one game: its resolved home/away/official
 * slots, plus any expert findings specific to this game.
 */
export interface GameProgressionCellResult {
  gameId: string;
  home: ResolvedSlot;
  away: ResolvedSlot;
  official: ResolvedSlot;
  findings: ProgressionFinding[];
}

/**
 * Full result of simulating the current graph. `cellsByGameId` drives the
 * per-row inline annotations in `GameTable.tsx`; `findings` (flattened,
 * de-duplicated) drives the "Progression Inspector" summary panel.
 */
export interface ProgressionSimulationResult {
  cellsByGameId: Map<string, GameProgressionCellResult>;
  findings: ProgressionFinding[];
}

/** Creates an empty simulation result (used when expert mode is off). */
export function createEmptyProgressionSimulationResult(): ProgressionSimulationResult {
  return {
    cellsByGameId: new Map(),
    findings: [],
  };
}
