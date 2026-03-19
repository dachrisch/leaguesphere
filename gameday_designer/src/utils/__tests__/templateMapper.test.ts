import { describe, it, expect } from 'vitest';
import { genericizeFlowState } from '../templateMapper';
import { FlowState, GlobalTeam, GlobalTeamGroup, FlowNode } from '../../types/flowchart';

describe('templateMapper', () => {
  it('should correctly genericize teams into group and team indices', () => {
    const groups: GlobalTeamGroup[] = [
      { id: 'g1', name: 'Group A', order: 0 },
      { id: 'g2', name: 'Group B', order: 1 },
    ];
    const teams: GlobalTeam[] = [
      { id: 't1', label: 'Team 1', groupId: 'g1', order: 0 },
      { id: 't2', label: 'Team 2', groupId: 'g1', order: 1 },
      { id: 't3', label: 'Team 3', groupId: 'g2', order: 0 },
    ];
    
    const nodes: FlowNode[] = [
      {
        id: 'game-1',
        type: 'game',
        position: { x: 0, y: 0 },
        data: {
          stage: 'Preliminary',
          stageType: 'STANDARD',
          standing: 'A1',
          homeTeamId: 't1', // Group 0, Team 0
          awayTeamId: 't2', // Group 0, Team 1
          official: { type: 'static', name: 't3' }, // Group 1, Team 0
          breakAfter: 0,
        }
      } as any,
    ];

    const flowState: Partial<FlowState> = {
      nodes,
      edges: [],
      fields: [],
      globalTeams: teams,
      globalTeamGroups: groups,
    };

    const template = genericizeFlowState(flowState as FlowState, "Test Template");
    
    expect(template.num_teams).toBe(3);
    expect(template.slots[0].home_group).toBe(0);
    expect(template.slots[0].home_team).toBe(0);
    expect(template.slots[0].away_group).toBe(0);
    expect(template.slots[0].away_team).toBe(1);
    expect(template.slots[0].official_group).toBe(1);
    expect(template.slots[0].official_team).toBe(0);
  });
});
