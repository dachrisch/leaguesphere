import type { ApiGameResult, Snapshot, SnapshotTeam } from './types';

function teamEntry(snapshot: Snapshot, teamId: number | null): SnapshotTeam | null {
  if (teamId === null) {
    return null;
  }
  return snapshot.teams?.[String(teamId)] ?? null;
}

/**
 * Full team name from the snapshot's `teams` map ("Nürnberg Renegades"),
 * falling back to the result's short code ("Nürn") or placeholder label.
 */
export function teamDisplayName(
  snapshot: Snapshot,
  result: ApiGameResult | null
): string {
  if (result === null) {
    return '';
  }
  return teamEntry(snapshot, result.team_id)?.description || result.team_name;
}

export function teamLogo(snapshot: Snapshot, teamId: number | null): string | null {
  return teamEntry(snapshot, teamId)?.logo ?? null;
}
