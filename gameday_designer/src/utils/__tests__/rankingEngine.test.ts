import { describe, it, expect } from 'vitest';
import { calculateRanking, getMergedRankingStages } from '../rankingEngine';
import type { GameNode } from '../../types/flowchart';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../types/flowchart';

describe('rankingEngine', () => {
  const createMockGame = (id: string, homeId: string | null, awayId: string | null, standing: string): GameNode => ({
    id,
    type: 'game',
    position: { x: 0, y: 0 },
    data: {
      type: 'game',
      stage: 'Preliminary',
      stageType: 'RANKING',
      standing,
      fieldId: 'field-1',
      official: null,
      breakAfter: 0,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeamDynamic: null,
      awayTeamDynamic: null,
    },
  });

  it('calculates ranking based on team appearances (placeholder for actual results)', () => {
    // Since we are in the DESIGN phase, we don't have actual scores.
    // However, a RANKING stage needs to know which teams are in it.
    // In the designer, the "ranking" is just the set of unique teams assigned to games in that stage.
    // The actual order (1st, 2nd) is usually determined by the team index in the group if RR,
    // or we might need a way for the user to specify the mapping if it's a complex stage.
    
    // For now, let's assume the ranking engine just extracts all unique teams in that stage.
    
    const games = [
      createMockGame('g1', 'team-1', 'team-2', 'Game 1'),
      createMockGame('g2', 'team-3', 'team-1', 'Game 2'),
    ];
    
    const ranking = calculateRanking(games);
    
    expect(ranking).toContain('team-1');
    expect(ranking).toContain('team-2');
    expect(ranking).toContain('team-3');
    expect(ranking.length).toBe(3);
  });

  describe('getMergedRankingStages', () => {
    it('merges two same-named ranking stages on different fields into one entry with all participants', () => {
      const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
      const field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
      // Same name, same stageType, different fields -> one logical group split across fields.
      const stageOnField1 = createStageNode('stage-1', 'field-1', { name: 'Gruppenphase', stageType: 'RANKING' });
      const stageOnField2 = createStageNode('stage-2', 'field-2', { name: 'Gruppenphase', stageType: 'RANKING' });

      const gameOnField1 = createGameNodeInStage('game-1', 'stage-1', { homeTeamId: 'team-1', awayTeamId: 'team-2' });
      const gameOnField2 = createGameNodeInStage('game-2', 'stage-2', { homeTeamId: 'team-3', awayTeamId: 'team-4' });

      const merged = getMergedRankingStages([
        field1, field2, stageOnField1, stageOnField2, gameOnField1, gameOnField2,
      ]);

      expect(merged).toHaveLength(1);
      expect(merged[0].name).toBe('Gruppenphase');
      expect(merged[0].stageIds.sort()).toEqual(['stage-1', 'stage-2']);
      expect(merged[0].participants.sort()).toEqual(['team-1', 'team-2', 'team-3', 'team-4']);
    });

    it('keeps differently-named ranking stages separate', () => {
      const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
      const stageA = createStageNode('stage-a', 'field-1', { name: 'Gruppe A', stageType: 'RANKING' });
      const stageB = createStageNode('stage-b', 'field-1', { name: 'Gruppe B', stageType: 'RANKING' });
      const gameA = createGameNodeInStage('game-a', 'stage-a', { homeTeamId: 'team-1', awayTeamId: 'team-2' });
      const gameB = createGameNodeInStage('game-b', 'stage-b', { homeTeamId: 'team-3', awayTeamId: 'team-4' });

      const merged = getMergedRankingStages([field1, stageA, stageB, gameA, gameB]);

      expect(merged).toHaveLength(2);
      const byName = Object.fromEntries(merged.map((m) => [m.name, m]));
      expect(byName['Gruppe A'].participants.sort()).toEqual(['team-1', 'team-2']);
      expect(byName['Gruppe B'].participants.sort()).toEqual(['team-3', 'team-4']);
    });

    it('excludes a merged group that contains the given stage id, to prevent self-reference', () => {
      const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
      const field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
      const stageOnField1 = createStageNode('stage-1', 'field-1', { name: 'Gruppenphase', stageType: 'RANKING' });
      const stageOnField2 = createStageNode('stage-2', 'field-2', { name: 'Gruppenphase', stageType: 'RANKING' });
      const gameOnField1 = createGameNodeInStage('game-1', 'stage-1', { homeTeamId: 'team-1', awayTeamId: 'team-2' });

      const merged = getMergedRankingStages(
        [field1, field2, stageOnField1, stageOnField2, gameOnField1],
        'stage-2' // excluding by the OTHER field's stage id must still exclude the whole merged group
      );

      expect(merged).toHaveLength(0);
    });

    it('splits participants into their round-robin groups within a merged stage', () => {
      const field1 = createFieldNode('field-1', { name: 'Field 1', order: 0 });
      const field2 = createFieldNode('field-2', { name: 'Field 2', order: 1 });
      const stageOnField1 = createStageNode('stage-1', 'field-1', { name: 'Gruppenphase', stageType: 'RANKING' });
      const stageOnField2 = createStageNode('stage-2', 'field-2', { name: 'Gruppenphase', stageType: 'RANKING' });
      const gameA = createGameNodeInStage('game-a', 'stage-1', { homeTeamId: 'team-1', awayTeamId: 'team-2' });
      gameA.data.group = 'A';
      const gameB = createGameNodeInStage('game-b', 'stage-2', { homeTeamId: 'team-3', awayTeamId: 'team-4' });
      gameB.data.group = 'B';

      const merged = getMergedRankingStages([field1, field2, stageOnField1, stageOnField2, gameA, gameB]);

      expect(merged).toHaveLength(1);
      const groupNames = merged[0].groups.map((g) => g.name).sort();
      expect(groupNames).toEqual(['A', 'B']);
    });
  });
});
