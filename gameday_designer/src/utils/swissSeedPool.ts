import type { FlowState, GlobalTeam } from '../types/flowchart';

export const SWISS_SEED_GROUP_A_ID = 'group-swiss-a';
export const SWISS_SEED_GROUP_B_ID = 'group-swiss-b';

export interface MergedSwissPool {
  merged: FlowState;
  didMerge: boolean;
}

/**
 * Merge Swiss seed teams into the canvas pool without duplicating existing ones.
 *
 * Pure helper extracted from `ListDesignerApp.handleGenerateSwiss` so the
 * grouping rules are unit-testable without rendering the designer.
 *
 * Rules (kept identical to the component):
 * - Teams already in `current.globalTeams` (by `id`) are never duplicated.
 * - When the pool has zero groups AND every incoming seed is ungrouped, two
 *   stable groups (`group-swiss-a/b`, `Gruppe A/B`) are created and seeds are
 *   split in halves by `seedTeamIds` order (first half → A, rest → B; odd
 *   count → extra team to A).
 * - When A/B groups already exist, ungrouped seeds (existing or missing) are
 *   assigned by seed half; user groups are left untouched and seeds without
 *   an A/B home keep `groupId` null.
 *
 * Returns `didMerge: false` when there is nothing new to import; the caller
 * should then persist `exportState()` directly instead of the merged object.
 */
export function buildMergedSwissPool(
  current: FlowState,
  incoming: GlobalTeam[],
  seedTeamIds: number[],
): MergedSwissPool {
  const seen = new Set(current.globalTeams.map((t) => t.id));
  const missing = incoming.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  if (missing.length === 0) {
    return { merged: current, didMerge: false };
  }

  const currentGroups = current.globalTeamGroups ?? [];
  let nextGroups = currentGroups;
  if (
    !currentGroups.some((g) => g.id === SWISS_SEED_GROUP_A_ID) &&
    !currentGroups.some((g) => g.id === SWISS_SEED_GROUP_B_ID) &&
    currentGroups.length === 0 &&
    incoming.every((seed) => !seed.groupId)
  ) {
    nextGroups = [
      ...currentGroups,
      { id: SWISS_SEED_GROUP_A_ID, name: 'Gruppe A', order: currentGroups.length },
      { id: SWISS_SEED_GROUP_B_ID, name: 'Gruppe B', order: currentGroups.length + 1 },
    ];
  }
  const groupA = nextGroups.find((g) => g.id === SWISS_SEED_GROUP_A_ID) ?? null;
  const groupB = nextGroups.find((g) => g.id === SWISS_SEED_GROUP_B_ID) ?? null;
  const seedOrderIds = seedTeamIds.map((pk) => String(pk));
  const groupAIds = new Set(seedOrderIds.slice(0, Math.ceil(seedOrderIds.length / 2)));
  const groupFor = (teamId: string): string | null => {
    if (groupAIds.has(teamId)) return groupA ? groupA.id : null;
    return groupB ? groupB.id : null;
  };
  const incomingIds = new Set(incoming.map((seed) => seed.id));
  const nextTeams =
    groupA || groupB
      ? [
          ...current.globalTeams.map((team) => {
            if (!incomingIds.has(team.id) || team.groupId) return team;
            const target = groupFor(team.id);
            return target ? { ...team, groupId: target } : team;
          }),
          ...missing.map((team) => ({ ...team, groupId: team.groupId ?? groupFor(team.id) })),
        ]
      : [...current.globalTeams, ...missing];

  return {
    merged: {
      ...current,
      globalTeams: nextTeams,
      globalTeamGroups: nextGroups,
    },
    didMerge: true,
  };
}
