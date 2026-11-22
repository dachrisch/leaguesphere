import type { StreamStatus } from "../context/useLivetickerStream";

interface ConnectionStatusProps {
  status: StreamStatus;
}

type DegradedStatus = Exclude<StreamStatus, "live">;

const LABELS: Record<DegradedStatus, string> = {
  reconnecting: "Verbindung wird wiederhergestellt …",
  polling: "Aktualisierung alle 60 s",
};

/**
 * How fresh is what I am reading? The live state is already shown by the
 * live badge in the header, so only a degraded connection gets a line.
 */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === "live") return null;

  return (
    <p
      className={`lt-connection lt-connection-${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="lt-connection-dot" aria-hidden="true" />
      {LABELS[status]}
    </p>
  );
}
