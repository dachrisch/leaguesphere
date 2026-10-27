/**
 * "This screen is showing stored data, not what the server says right now."
 *
 * A device that boots without a network renders the last preloaded payload
 * (Task 20). That is what makes the app usable on the sideline, but it also
 * means a finished game can still look like a running one — the official has
 * to be able to tell the difference before tapping.
 */
interface SnapshotHintProps {
  /** `StoredSnapshot.updatedAt`; `null` means the value came from the network. */
  updatedAt?: number | null;
}

/** `Zwischengespeichert · HH:MM` in the device's own time zone. */
export function snapshotLabel(updatedAt: number): string {
  const stored = new Date(updatedAt);
  const hours = String(stored.getHours()).padStart(2, "0");
  const minutes = String(stored.getMinutes()).padStart(2, "0");
  return `Zwischengespeichert · ${hours}:${minutes}`;
}

export default function SnapshotHint({ updatedAt = null }: SnapshotHintProps) {
  if (updatedAt === null || updatedAt === undefined) {
    return null;
  }
  return (
    <p className="snaphint" role="status">
      {snapshotLabel(updatedAt)}
    </p>
  );
}
