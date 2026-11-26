import type { Side } from "./logic";

/**
 * Guards shared by the keyboard shortcuts and the rendered action buttons.
 * Pure so both consumers read the same rule without a second source of truth.
 */
export interface ComposerGating {
  posting: boolean;
  possessionPending: boolean;
  halftimePending: boolean;
  finished: boolean;
  readOnly: boolean;
  possessionSide: Side | null;
  possessionName: string | null;
  /** An open extra point locks every tile except the penalty flag. */
  pendingPat?: unknown;
}

/**
 * Nothing happens between the touchdown and the try, except a penalty: a
 * foul during the try is enforced on the try itself, so the flag must stay
 * reachable while the prompt is open.
 */
export function penaltyDisabled({
  posting,
  possessionPending,
  halftimePending,
  finished,
  readOnly,
  possessionSide,
  possessionName,
}: ComposerGating): boolean {
  return (
    posting ||
    possessionPending ||
    halftimePending ||
    finished ||
    readOnly ||
    possessionSide === null ||
    possessionName === null
  );
}

/** Every scoring/tile action waits for an open try and for pending writes. */
export function composerDisabled({
  pendingPat,
  posting,
  possessionPending,
  halftimePending,
  finished,
  readOnly,
  possessionSide,
  possessionName,
}: ComposerGating): boolean {
  return (
    pendingPat !== null ||
    posting ||
    possessionPending ||
    halftimePending ||
    finished ||
    readOnly ||
    possessionSide === null ||
    possessionName === null
  );
}

export function touchdownLabel(possessionName: string | null): string {
  return possessionName === null ? "Touchdown" : `Touchdown ${possessionName}`;
}

/**
 * Starting the half writes two things in a row (the marker, then the ball).
 * A possession change or an undo still on its way would land in between and
 * either skip the flip or answer with a stale half, so the block waits.
 */
export function halftimeDisabled({
  pendingPat,
  halftimePending,
  posting,
  possessionPending,
  undoKey,
  readOnly,
}: {
  pendingPat: unknown;
  halftimePending: boolean;
  posting: boolean;
  possessionPending: boolean;
  undoKey: string | null;
  readOnly: boolean;
}): boolean {
  return (
    pendingPat !== null ||
    halftimePending ||
    posting ||
    possessionPending ||
    undoKey !== null ||
    readOnly
  );
}
