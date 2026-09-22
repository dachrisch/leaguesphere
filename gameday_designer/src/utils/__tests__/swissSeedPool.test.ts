import { describe, it, expect } from 'vitest';
import { buildMergedSwissPool, SWISS_SEED_GROUP_A_ID, SWISS_SEED_GROUP_B_ID } from '../swissSeedPool';
import type { FlowState, GlobalTeam } from '../../types/flowchart';

const team = (id: string, groupId: string | null = null): GlobalTeam => ({
  id,
  label: `Team ${id}`,
  groupId,
  order: 0,
});

const baseState = (teams: GlobalTeam[] = [], groups: FlowState['globalTeamGroups'] = []): FlowState => ({
  nodes: [],
  edges: [],
  globalTeams: teams,
  globalTeamGroups: groups,
});

describe('buildMergedSwissPool', () => {
  it('returns didMerge false when nothing is missing', () => {
    const current = baseState([team('138'), team('522')]);
    const { merged, didMerge } = buildMergedSwissPool(current, [team('138'), team('522')], [138, 522]);
    expect(didMerge).toBe(false);
    expect(merged).toBe(current);
  });

  it('deduplicates incoming ids within the same payload', () => {
    const current = baseState([]);
    const dupes = [team('138'), team('138'), team('522')];
    const { merged, didMerge } = buildMergedSwissPool(current, dupes, [138, 522]);
    expect(didMerge).toBe(true);
    expect(merged.globalTeams.map((t) => t.id).sort()).toEqual(['138', '522']);
  });

  it('splits seeds into Gruppe A/B halves on an empty pool', () => {
    const { merged } = buildMergedSwissPool(baseState(), [team('138'), team('522'), team('907'), team('41')], [138, 522, 907, 41]);
    expect(merged.globalTeamGroups).toMatchObject([
      { id: SWISS_SEED_GROUP_A_ID, name: 'Gruppe A', order: 0 },
      { id: SWISS_SEED_GROUP_B_ID, name: 'Gruppe B', order: 1 },
    ]);
    const byGroup = (g: string) => merged.globalTeams.filter((t) => t.groupId === g).map((t) => t.id).sort();
    expect(byGroup(SWISS_SEED_GROUP_A_ID)).toEqual(['138', '522']);
    expect(byGroup(SWISS_SEED_GROUP_B_ID)).toEqual(['41', '907']);
  });

  it('gives the extra team to Gruppe A on odd counts', () => {
    const { merged } = buildMergedSwissPool(
      baseState(),
      [team('1'), team('2'), team('3'), team('4'), team('5')],
      [1, 2, 3, 4, 5],
    );
    const byGroup = (g: string) => merged.globalTeams.filter((t) => t.groupId === g).map((t) => t.id).sort();
    expect(byGroup(SWISS_SEED_GROUP_A_ID)).toEqual(['1', '2', '3']);
    expect(byGroup(SWISS_SEED_GROUP_B_ID)).toEqual(['4', '5']);
  });

  it('reuses existing A/B groups for newly missing seeds by seed half', () => {
    const current = baseState([team('138', SWISS_SEED_GROUP_A_ID)], [
      { id: SWISS_SEED_GROUP_A_ID, name: 'Gruppe A', order: 0 },
      { id: SWISS_SEED_GROUP_B_ID, name: 'Gruppe B', order: 1 },
    ]);
    const { merged } = buildMergedSwissPool(current, [team('138', SWISS_SEED_GROUP_A_ID), team('522')], [138, 522]);
    expect(merged.globalTeamGroups).toHaveLength(2);
    expect(merged.globalTeams.find((t) => t.id === '522')).toMatchObject({ groupId: SWISS_SEED_GROUP_B_ID });
    expect(merged.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: SWISS_SEED_GROUP_A_ID });
  });

  it('regroups existing ungrouped incoming members when A/B become available', () => {
    const current = baseState([team('138')]);
    const { merged } = buildMergedSwissPool(current, [team('138'), team('522')], [138, 522]);
    // Empty pool groups → A/B created; pre-existing 138 (ungrouped, in seed half A) moves to A.
    expect(merged.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: SWISS_SEED_GROUP_A_ID });
    expect(merged.globalTeams.find((t) => t.id === '522')).toMatchObject({ groupId: SWISS_SEED_GROUP_B_ID });
  });

  it('leaves user groups untouched and keeps missing seeds ungrouped', () => {
    const current = baseState([team('99', 'g1')], [{ id: 'g1', name: 'Gruppe A', order: 0 }]);
    const { merged } = buildMergedSwissPool(current, [team('138'), team('522')], [138, 522]);
    expect(merged.globalTeamGroups).toEqual([{ id: 'g1', name: 'Gruppe A', order: 0 }]);
    expect(merged.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: null });
    expect(merged.globalTeams.find((t) => t.id === '522')).toMatchObject({ groupId: null });
    expect(merged.globalTeams.find((t) => t.id === '99')).toMatchObject({ groupId: 'g1' });
  });

  it('keeps explicitly grouped incoming seeds as-is when no A/B groups exist', () => {
    const current = baseState([], [{ id: 'g1', name: 'Custom', order: 0 }]);
    const { merged } = buildMergedSwissPool(current, [{ ...team('138'), groupId: 'g1' }], [138]);
    expect(merged.globalTeamGroups).toHaveLength(1);
    expect(merged.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: 'g1' });
  });

  it('does not create A/B groups when incoming seeds already carry groups', () => {
    const { merged } = buildMergedSwissPool(baseState(), [{ ...team('138'), groupId: 'g1' }, team('522')], [138, 522]);
    expect(merged.globalTeamGroups).toHaveLength(0);
    expect(merged.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: 'g1' });
    expect(merged.globalTeams.find((t) => t.id === '522')).toMatchObject({ groupId: null });
  });
});
