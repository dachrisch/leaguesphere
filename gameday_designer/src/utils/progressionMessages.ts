/**
 * Shared message-formatting helper for Expert Mode progression findings —
 * used by both `ProgressionInspectorPanel.tsx` and `list/GameTable.tsx` so
 * the translation logic (and its fallback behavior) lives in exactly one
 * place instead of being copy-pasted per call site.
 */

import type { ProgressionFinding } from '../types/progression';

/** Minimal shape of `useTypedTranslation`'s `t` this helper actually needs. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Resolves a finding's display text: the translated string for its
 * `messageKey`/`messageParams` when present, otherwise `finding.message`.
 *
 * Every finding `progressionSimulator.ts` actually produces sets both
 * fields, so `message` (untranslated English, meant only as a fallback for
 * ad-hoc/test-constructed findings) should never reach a real user — if it
 * does, that's a bug upstream (a finding built without a `messageKey`), so
 * this logs a warning to make that discoverable rather than silently
 * showing raw English text to non-English users.
 */
export function getProgressionFindingMessage(finding: ProgressionFinding, t: Translate): string {
  if (finding.messageKey) {
    return t(`validation:${finding.messageKey}`, finding.messageParams);
  }
  console.warn(
    `[ProgressionFinding] "${finding.id}" (${finding.type}) has no messageKey — falling back to its untranslated dev-only message. This should not happen for findings produced by progressionSimulator.ts.`
  );
  return finding.message;
}
