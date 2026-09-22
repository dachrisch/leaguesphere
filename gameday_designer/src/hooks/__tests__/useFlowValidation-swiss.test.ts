import { describe, it, expect } from 'vitest';
import { validateFlowchart } from '../useFlowValidation';
import type { FlowNode, GamedayMetadata } from '../../types/flowchart';

const validMetadata: GamedayMetadata = {
  id: 1,
  name: 'Swiss Gameday',
  date: '2099-01-01',
  start: '10:00',
  format: '6_2',
  author: 1,
  address: 'Valid Venue',
  season: 1,
  league: 1,
  status: 'DRAFT',
};

function fieldNode(id: string, name: string): FlowNode {
  return {
    id,
    type: 'field',
    data: { type: 'field', name, order: 0 },
    position: { x: 0, y: 0 },
  } as FlowNode;
}

function swissStageNode(id: string, fieldId: string, round: number, fieldNo: number): FlowNode {
  return {
    id,
    type: 'stage',
    parentId: fieldId,
    data: {
      type: 'stage',
      name: `Swiss Round ${round}`,
      category: 'preliminary',
      stageType: 'STANDARD',
      order: round - 1,
      progressionMode: 'swiss',
      swissRound: round,
      swissField: fieldNo,
    },
    position: { x: 0, y: 0 },
  } as FlowNode;
}

function gameNode(
  id: string,
  stageId: string,
  standing: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
  startTime = '10:00'
): FlowNode {
  return {
    id,
    type: 'game',
    parentId: stageId,
    data: {
      type: 'game',
      stage: 'Preliminary',
      stageType: 'STANDARD',
      breakAfter: 0,
      homeTeamDynamic: null,
      awayTeamDynamic: null,
      standing,
      homeTeamId,
      awayTeamId,
      fieldId: null,
      official: null,
      startTime,
      duration: 50,
    },
    position: { x: 0, y: 0 },
  } as unknown as FlowNode;
}

/** Round 1 (generated, has teams) + Round 2 (ungenerated placeholders, null teams). */
function swissNodes(): FlowNode[] {
  return [
    fieldNode('field-1', 'Field 1'),
    swissStageNode('swiss-round-1-field-1', 'field-1', 1, 1),
    swissStageNode('swiss-round-2-field-1', 'field-1', 2, 1),
    gameNode('r1g1', 'swiss-round-1-field-1', 'R1 G1', 'team1', 'team2', '10:00'),
    gameNode('r1g2', 'swiss-round-1-field-1', 'R1 G2', 'team3', 'team4', '11:00'),
    gameNode('r2g1', 'swiss-round-2-field-1', 'R2 G1', null, null, '12:00'),
    gameNode('r2g2', 'swiss-round-2-field-1', 'R2 G2', null, null, '13:00'),
  ];
}

describe('useFlowValidation - Swiss placeholders', () => {
  it('produces NO team-connection errors for placeholders in ungenerated Swiss rounds', () => {
    const result = validateFlowchart(swissNodes(), [], [], [], validMetadata, 1);

    const teamErrors = result.errors.filter((e) => e.type === 'incomplete_game_inputs');
    expect(teamErrors).toHaveLength(0);
    expect(result.isValid).toBe(true);
  });

  it('still errors for a missing-team game in a GENERATED Swiss round (round <= completed)', () => {
    const nodes = swissNodes();
    // R1 game loses its away team — round 1 is generated, so this must still error.
    const broken = nodes.map((n) =>
      n.id === 'r1g1'
        ? ({ ...n, data: { ...(n.data as object), awayTeamId: null } } as FlowNode)
        : n
    );

    const result = validateFlowchart(broken, [], [], [], validMetadata, 1);

    const teamErrors = result.errors.filter((e) => e.type === 'incomplete_game_inputs');
    expect(teamErrors).toHaveLength(1);
    expect(teamErrors[0].affectedNodes).toContain('r1g1');
  });

  it('validates non-Swiss games byte-identically when no Swiss state is passed', () => {
    // No swissCompletedRounds arg: placeholders in swiss stages must error exactly as today.
    const result = validateFlowchart(swissNodes(), [], [], [], validMetadata);

    const teamErrors = result.errors.filter((e) => e.type === 'incomplete_game_inputs');
    expect(teamErrors).toHaveLength(2);
    expect(teamErrors.map((e) => e.affectedNodes).flat()).toEqual(
      expect.arrayContaining(['r2g1', 'r2g2'])
    );
  });

  it('does not exempt placeholders once their round is generated', () => {
    // completedRounds=1: a null-team game in round 1 still errors.
    const nodes: FlowNode[] = [
      fieldNode('field-1', 'Field 1'),
      swissStageNode('swiss-round-1-field-1', 'field-1', 1, 1),
      gameNode('r1g1', 'swiss-round-1-field-1', 'R1 G1', null, null),
    ];

    const result = validateFlowchart(nodes, [], [], [], validMetadata, 1);

    expect(result.errors.filter((e) => e.type === 'incomplete_game_inputs')).toHaveLength(1);
  });
});
