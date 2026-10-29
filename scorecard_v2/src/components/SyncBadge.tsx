/**
 * The sync badge: what the outbox is doing, and the way out of a pause.
 *
 * States, exactly as the offline contract names them:
 *
 * - `Synchron` — nothing queued.
 * - `N warten` / `N warten · M abgelehnt` — writes are queued, and M of them
 *   were rejected. The badge is actionable in both cases.
 * - `Offline · N` — no network; the queue survives.
 * - `Pausiert · <reason>` — the server said no (expired session, another
 *   device holds the game). Tapping lifts the pause and retries.
 *
 * The chip is who the official looks at: one dot plus one word in the app bar.
 * Everything a tap cannot fix lives next to the screen in {@link SyncDetails}:
 *
 * - A rejected write is visible as "1 Eintrag abgelehnt" with a retry and a
 *   drop, so a bad payload cannot disappear quietly between two flushes.
 * - A queue blocked by an expired session lists its ops with "Verwerfen":
 *   without that, a game whose session died on a shared device could never be
 *   finalised.
 */
import { useSyncStatus, type SyncStatus } from "../session/useSyncStatus";
import { getRuntime } from "../session/runtime";
import type { PauseReason } from "../offline/sync";
import type { StoredOp } from "../offline/types";

interface SyncBadgeProps {
  /** The open game. Without one the engine-wide total is shown. */
  gameId?: number | null;
  /**
   * `inline` is the compact chip for the app bar; `block` adds the
   * explanations below it for callers that render the badge in the body.
   */
  variant?: "block" | "inline";
  /**
   * The status the screen already holds. A screen that shows both the chip and
   * {@link SyncDetails} reads the outbox once and passes it to both; without it
   * the badge subscribes on its own.
   */
  status?: SyncStatus;
}

interface LabelState {
  paused: PauseReason | null;
  pending: number;
  failed: number;
  online: boolean;
}

/** The badge text. Exported so the states are tested without a DOM. */
export function syncLabel({
  paused,
  pending,
  failed,
  online,
}: LabelState): string {
  if (paused === "device") {
    return "Pausiert · anderes Gerät";
  }
  if (paused === "auth") {
    return "Pausiert · Anmeldung";
  }
  if (paused === "offline" || !online) {
    return pending > 0 ? `Offline · ${pending}` : "Offline";
  }
  const waiting = pending > 0 ? `${pending} warten` : null;
  const rejected = failed > 0 ? `${failed} abgelehnt` : null;
  const parts = [waiting, rejected].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? "Synchron" : parts.join(" · ");
}

/** What the pause means for the official, in one sentence. */
export function pauseReason(paused: PauseReason | null): string | null {
  if (paused === "device") {
    return "Das Spiel läuft auf einem anderen Gerät. Dieses Gerät ist nur lesend.";
  }
  if (paused === "auth") {
    return "Die Anmeldung ist abgelaufen. Bitte neu anmelden, dann wird gesendet.";
  }
  return null;
}

export function failedLabel(count: number): string {
  return count === 1 ? "1 Eintrag abgelehnt" : `${count} Einträge abgelehnt`;
}

/** Colour tone of the chip; the word next to the dot carries the same state. */
export type SyncTone = "ok" | "wait" | "off";

export interface BadgeState {
  label: string;
  tone: SyncTone;
  /** True when a tap does something: resume the pause or flush the queue. */
  actionable: boolean;
  /** The one-sentence pause explanation, if the queue is paused. */
  reason: string | null;
  /** Ops only an expired session blocks; they can be dropped. */
  droppable: StoredOp[];
}

/**
 * Everything the chip and the details read from one status, in one place, so
 * the two halves cannot disagree about the state.
 */
export function badgeState(status: SyncStatus): BadgeState {
  const paused = status.paused !== null || !status.online;
  const queued = status.pending > 0 || status.failed > 0;
  return {
    label: syncLabel(status),
    tone: paused ? "off" : queued ? "wait" : "ok",
    actionable: status.paused !== null || queued,
    reason: pauseReason(status.paused),
    // A device lock is one game's read-only answer; it must not invite the
    // official to throw away ops that are only waiting.
    droppable: status.paused === "auth" ? status.pendingOps : [],
  };
}

/** Whether the chip alone hides something only the details can resolve. */
export function hasDetails(status: SyncStatus): boolean {
  const { reason, droppable } = badgeState(status);
  return reason !== null || droppable.length > 0 || status.failed > 0;
}

const OP_LABEL: Record<StoredOp["kind"], string> = {
  event: "Eintrag",
  delete: "Rückgängig",
  correction: "Rückgängig",
  possession: "Ballbesitz",
  halftime: "Halbzeit",
};

/** The dot plus one word: the whole sync state at a glance. */
function Chip({ status, inline }: { status: SyncStatus; inline: boolean }) {
  const { label, tone, actionable } = badgeState(status);
  const className = `syncbadge syncbadge-${tone}${
    inline ? " syncbadge-inline" : ""
  }`;
  const name = `Übertragung: ${label}`;
  const body = (
    <>
      <span aria-hidden="true" className="syncdot" />
      <span className="syncbadge-label">{label}</span>
    </>
  );

  if (!actionable) {
    return (
      <span className={className} title={name}>
        {body}
      </span>
    );
  }

  const retryNow = (): void => {
    if (status.paused !== null) {
      void status.resume();
      return;
    }
    void getRuntime().sync.flushAll();
  };

  return (
    <button
      aria-label={`${name} – jetzt versuchen`}
      className={className}
      onClick={retryNow}
      title={`${name} – jetzt versuchen`}
      type="button"
    >
      {body}
    </button>
  );
}

/** Pause explanation and the per-op actions a tap on the chip cannot offer. */
function Details({ status }: { status: SyncStatus }) {
  const { reason, droppable } = badgeState(status);

  return (
    <>
      {reason === null ? null : <p className="syncwhy">{reason}</p>}

      {droppable.length > 0 ? (
        <div className="syncfailed">
          <p className="syncfailed-head">
            {droppable.length === 1
              ? "1 Eintrag wartet auf die Anmeldung"
              : `${droppable.length} Einträge warten auf die Anmeldung`}
          </p>
          <ul className="syncfailed-list">
            {droppable.map((op) => (
              <li className="syncfailed-row" key={op.id}>
                <span className="syncfailed-op">{OP_LABEL[op.kind]}</span>
                <span className="syncfailed-reason">
                  Wird erst nach der Anmeldung gesendet
                </span>
                <span className="syncfailed-actions">
                  <button
                    className="synclink"
                    onClick={() => void status.drop(op.id)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status.failed > 0 ? (
        <div className="syncfailed">
          <p className="syncfailed-head">{failedLabel(status.failed)}</p>
          <ul className="syncfailed-list">
            {status.failedOps.map((op) => (
              <li className="syncfailed-row" key={op.id}>
                <span className="syncfailed-op">{OP_LABEL[op.kind]}</span>
                <span className="syncfailed-reason">
                  {op.failedReason ?? "Unbekannter Fehler"}
                </span>
                <span className="syncfailed-actions">
                  <button
                    className="synclink"
                    onClick={() => void status.retry(op.id)}
                    type="button"
                  >
                    Erneut versuchen
                  </button>
                  <button
                    className="synclink"
                    onClick={() => void status.drop(op.id)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** The badge itself, from a status the caller owns. */
function BadgeView({
  status,
  variant,
}: {
  status: SyncStatus;
  variant: "block" | "inline";
}) {
  if (variant === "inline") {
    return <Chip inline status={status} />;
  }

  return (
    <section aria-label="Übertragung" className="syncbar">
      <Chip inline={false} status={status} />
      <Details status={status} />
    </section>
  );
}

/** Reads the outbox for a screen that does not watch it itself. */
function LiveBadge({
  gameId,
  variant,
}: {
  gameId: number | null;
  variant: "block" | "inline";
}) {
  const status = useSyncStatus(gameId);
  return <BadgeView status={status} variant={variant} />;
}

/**
 * The chip. In `inline` mode it is the app bar's status; otherwise it brings
 * its own block with the details, for screens that render it in the body.
 */
export default function SyncBadge({
  gameId = null,
  variant = "block",
  status,
}: SyncBadgeProps) {
  return status === undefined ? (
    <LiveBadge gameId={gameId} variant={variant} />
  ) : (
    <BadgeView status={status} variant={variant} />
  );
}

/** The details, from a status the caller owns; nothing while it is clean. */
function DetailsView({ status }: { status: SyncStatus }) {
  if (!hasDetails(status)) {
    return null;
  }

  return (
    <section aria-label="Übertragungsdetails" className="syncbar syncdetails">
      <Details status={status} />
    </section>
  );
}

function LiveDetails({ gameId }: { gameId: number | null }) {
  const status = useSyncStatus(gameId);
  return <DetailsView status={status} />;
}

/**
 * The part of the badge that needs its own row: why a queue is paused and the
 * ops the official has to retry or drop. Renders nothing while there is
 * nothing to explain, so the chip alone keeps the header calm.
 */
export function SyncDetails({
  gameId = null,
  status,
}: {
  gameId?: number | null;
  status?: SyncStatus;
}) {
  return status === undefined ? (
    <LiveDetails gameId={gameId} />
  ) : (
    <DetailsView status={status} />
  );
}
