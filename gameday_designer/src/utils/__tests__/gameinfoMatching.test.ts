import { describe, it, expect } from 'vitest';
import { buildGameNodeMatchIndex, matchGamesToNodes } from '../gameinfoMatching';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../types/flowchart';
import type { GameResultsDisplay } from '../../types/designer';

const makeApiGame = (overrides: Partial<GameResultsDisplay>): GameResultsDisplay => ({
  id: 1,
  field: 1,
  scheduled: '10:00:00.000000',
  status: 'DRAFT',
  stage: 'Gruppenphase',
  standing: 'Gruppenphase',
  results: [],
  ...overrides,
});

describe('gameinfoMatching', () => {
  // Reproduces gameday 646: five group-stage games across two fields all
  // sharing the same `standing` ("Gruppenphase"), two of them scheduled at
  // the exact same time on different fields.
  it('matches every game correctly when a group shares one standing across two fields', () => {
    const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
    const stage1 = createStageNode('stage-1', 'field-1', { name: 'Gruppenphase' });
    const stage2 = createStageNode('stage-2', 'field-2', { name: 'Gruppenphase' });

    const gA = createGameNodeInStage('game-a', 'stage-1', { standing: 'Gruppenphase', startTime: '10:00' });
    const gB = createGameNodeInStage('game-b', 'stage-2', { standing: 'Gruppenphase', startTime: '10:00' });
    const gC = createGameNodeInStage('game-c', 'stage-1', { standing: 'Gruppenphase', startTime: '11:10' });
    const gD = createGameNodeInStage('game-d', 'stage-2', { standing: 'Gruppenphase', startTime: '11:10' });
    const gE = createGameNodeInStage('game-e', 'stage-1', { standing: 'Gruppenphase', startTime: '12:20' });

    const allNodes = [field1, field2, stage1, stage2, gA, gB, gC, gD, gE];

    const apiGames: GameResultsDisplay[] = [
      makeApiGame({ id: 7432, field: 1, scheduled: '10:00:00.000000' }),
      makeApiGame({ id: 7433, field: 2, scheduled: '10:00:00.000000' }),
      makeApiGame({ id: 7434, field: 1, scheduled: '11:10:00.000000' }),
      makeApiGame({ id: 7435, field: 2, scheduled: '11:10:00.000000' }),
      makeApiGame({ id: 7436, field: 1, scheduled: '12:20:00.000000' }),
    ];

    const matches = matchGamesToNodes(allNodes, apiGames);

    expect(matches).toHaveLength(5);
    const byGameinfoId = Object.fromEntries(matches.map((m) => [m.gameinfoId, m.node.id]));
    expect(byGameinfoId[7432]).toBe('game-a');
    expect(byGameinfoId[7433]).toBe('game-b');
    expect(byGameinfoId[7434]).toBe('game-c');
    expect(byGameinfoId[7435]).toBe('game-d');
    expect(byGameinfoId[7436]).toBe('game-e');
  });

  it('does not cross-match games on different fields at the same time', () => {
    const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    const field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
    const stage1 = createStageNode('stage-1', 'field-1', { name: 'Gruppenphase' });
    const stage2 = createStageNode('stage-2', 'field-2', { name: 'Gruppenphase' });
    const gA = createGameNodeInStage('game-a', 'stage-1', { standing: 'Gruppenphase', startTime: '10:00' });
    const gB = createGameNodeInStage('game-b', 'stage-2', { standing: 'Gruppenphase', startTime: '10:00' });

    const index = buildGameNodeMatchIndex([field1, field2, stage1, stage2, gA, gB]);

    expect(index.size).toBe(2);
    const matchOnField1 = matchGamesToNodes(
      [field1, field2, stage1, stage2, gA, gB],
      [makeApiGame({ id: 1, field: 1, scheduled: '10:00:00.000000' })]
    );
    expect(matchOnField1).toEqual([{ node: gA, gameinfoId: 1 }]);
  });

  it('skips a game node with no start time rather than mismatching it', () => {
    const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
    const stage1 = createStageNode('stage-1', 'field-1', { name: 'Finale' });
    const gNoTime = createGameNodeInStage('game-no-time', 'stage-1', { standing: 'FIN' });

    const matches = matchGamesToNodes(
      [field1, stage1, gNoTime],
      [makeApiGame({ id: 99, stage: 'Finale', standing: 'FIN', field: 1, scheduled: '16:00:00' })]
    );

    expect(matches).toHaveLength(0);
  });
});
