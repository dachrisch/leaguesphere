/**
 * What a phone shows when it lost the game lock but still holds entries.
 *
 * The display only: it never decides whether the entries may be delivered and
 * never offers retry/drop. It answers three questions for the read-only strip:
 * how many entries are stranded, which entries they are, and whether this
 * device's own score differs from the official one.
 */
import type { GameLog } from "../api/types";
import type { StoredOp } from "../offline/types";
import { opLabel } from "../offline/opLabel";
import { displayOf, type EventEnvelope } from "./events";
import type { SyncStatus } from "./useSyncStatus";

type StrandedStatus = Pick<SyncStatus, "paused" | "pending">;

/** True only for the case the strip has to explain: lock lost, entries left. */
export function isStranded(status: StrandedStatus): boolean {
  return status.paused === "device" && status.pending > 0;
}

export interface StrandedScores {
  officialHome: number;
  officialAway: number;
  deviceHome: number;
  deviceAway: number;
  /** The device adds points the official record does not have. */
  differs: boolean;
}

/** The server's score next to this device's optimistic one. */
export function strandedScores(
  serverLog: GameLog,
  deviceLog: GameLog,
): StrandedScores {
  return {
    officialHome: serverLog.home.score,
    officialAway: serverLog.away.score,
    deviceHome: deviceLog.home.score,
    deviceAway: deviceLog.away.score,
    differs:
      serverLog.home.score !== deviceLog.home.score ||
      serverLog.away.score !== deviceLog.away.score,
  };
}

/** The one sentence in the strip; it names the count and the consequence. */
export function strandedNotice(count: number): string {
  const entries = count === 1 ? "1 Eintrag" : `${count} Einträge`;
  return `${entries} nicht übertragen – nicht im offiziellen Spielbericht.`;
}

/** Why this device's main score is the official one, when it differs. */
export function strandedScoreNote(scores: StrandedScores): string | null {
  if (!scores.differs) {
    return null;
  }
  return (
    `Dieses Gerät zeigt zusätzlich ${scores.deviceHome}:${scores.deviceAway} ` +
    "(nicht offiziell)."
  );
}

/** The row's label in the stranded list: the event's name where there is one. */
export function strandedOpTitle(op: StoredOp): string {
  const envelopes = (op.payload as { events?: EventEnvelope[] } | null)?.events;
  const first = Array.isArray(envelopes) ? envelopes[0] : undefined;
  if (first === undefined) {
    return opLabel(op.kind);
  }
  const display = displayOf(first);
  // A possession `home`/`away` event writes no row; its op kind names it.
  return display.event ?? opLabel(op.kind);
}
