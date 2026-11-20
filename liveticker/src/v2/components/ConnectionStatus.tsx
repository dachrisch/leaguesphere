import type { StreamStatus } from "../context/useLivetickerStream";

interface ConnectionStatusProps {
  status: StreamStatus;
}

const LABELS: Record<StreamStatus, string> = {
  live: "Live",
  reconnecting: "Verbindung wird wiederhergestellt …",
  polling: "Aktualisierung alle 60 s",
};

/** One always-visible line: how fresh is what I am reading? */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
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
