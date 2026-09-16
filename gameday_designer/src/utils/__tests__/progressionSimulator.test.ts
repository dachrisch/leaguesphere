import { describe, it, expect } from 'vitest';
import { simulateProgression } from '../progressionSimulator';
import type { FlowNode, FlowEdge, FieldNode, StageNode, GameNode } from '../../types/flowchart';
import type { GlobalTeam } from '../../types/flowchart';
import { createGameToGameEdge } from '../../types/flowchart';
import type { TeamReference } from '../../types/designer';

/**
 * Test suite for the progression simulator (Expert Mode).
 *
 * Builds small bracket/graph fixtures directly (no edges are required — the
 * simulator resolves purely from `homeTeamDynamic`/`awayTeamDynamic`/`official`
 * TeamReferences on game nodes, the same data GameTable reads for display).
 */
describe('progressionSimulator', () => {
  const team = (id: string, label: string): GlobalTeam => ({
    id,
    label,
    groupId: null,
    order: 0,
  });

  const field = (id: string, order = 0): FieldNode => ({
    id,
    type: 'field',
    position: { x: 0, y: 0 },
    data: { type: 'field', name: `Feld ${order + 1}`, order },
  });

  const stage = (
    id: string,
    parentId: string,
    name: string,
    order: number,
    stageType: 'STANDARD' | 'RANKING' = 'STANDARD'
  ): StageNode => ({
    id,
    type: 'stage',
    parentId,
    position: { x: 0, y: 0 },
    data: {
      type: 'stage',
      name,
      category: 'preliminary',
      stageType,
      order,
    },
  });

  interface GameOptions {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    homeTeamDynamic?: TeamReference | null;
    awayTeamDynamic?: TeamReference | null;
    official?: TeamReference | null;
    status?: string;
    final_score?: { home: number; away: number } | null;
    group?: string;
  }

  const game = (
    id: string,
    parentId: string,
    stageName: string,
    standing: string,
    options: GameOptions = {},
    stageType: 'STANDARD' | 'RANKING' = 'STANDARD'
  ): GameNode => ({
    id,
    type: 'game',
    parentId,
    position: { x: 0, y: 0 },
    data: {
      type: 'game',
      stage: stageName,
      stageType,
      standing,
      fieldId: null,
      official: options.official ?? null,
      breakAfter: 0,
      homeTeamId: options.homeTeamId ?? null,
      awayTeamId: options.awayTeamId ?? null,
      homeTeamDynamic: options.homeTeamDynamic ?? null,
      awayTeamDynamic: options.awayTeamDynamic ?? null,
      status: options.status,
      final_score: options.final_score,
      group: options.group,
    },
  });

  const winnerRef = (matchName: string): TeamReference => ({ type: 'winner', matchName });
  const loserRef = (matchName: string): TeamReference => ({ type: 'loser', matchName });
  const rankRef = (stageId: string, stageName: string, place: number): TeamReference => ({
    type: 'rank',
    place,
    stageId,
    stageName,
  });
  const groupRankRef = (
    stageId: string,
    stageName: string,
    groupName: string,
    place: number
  ): TeamReference => ({ type: 'groupRank', place, groupName, stageId, stageName });

  describe('static assignments', () => {
    it('resolves a directly-assigned team as actual, with no findings', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g = game('g1', 's1', 'Preliminary', 'Spiel 1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];

      const result = simulateProgression(nodes, [], teams);

      const cell = result.cellsByGameId.get('g1')!;
      expect(cell.home).toEqual({ teamLabel: 'Team A', basis: 'actual' });
      expect(cell.away).toEqual({ teamLabel: 'Team B', basis: 'actual' });
      expect(result.findings).toHaveLength(0);
    });

    it('resolves a static TeamReference literally', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const g = game('g1', 's1', 'Preliminary', 'Spiel 1', {
        homeTeamDynamic: { type: 'static', name: 'Gastteam' },
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];
      const teams: GlobalTeam[] = [team('t2', 'Team B')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('g1')!.home).toEqual({
        teamLabel: 'Gastteam',
        basis: 'actual',
      });
    });
  });

  describe('winner/loser chains', () => {
    it('resolves winner/loser of a completed game as actual', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B'), team('t3', 'Team C')];
      const sf = game('sf', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 21, away: 14 },
      });
      const final = game('final', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
        awayTeamDynamic: loserRef('HF1'),
      });
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, [], teams);

      const cell = result.cellsByGameId.get('final')!;
      expect(cell.home).toEqual({ teamLabel: 'Team A', basis: 'actual', sourceGameId: 'sf' });
      expect(cell.away).toEqual({ teamLabel: 'Team B', basis: 'actual', sourceGameId: 'sf' });
    });

    it('projects a hypothetical outcome (home wins) for an unplayed game', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const sf = game('sf', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Geplant',
      });
      const final = game('final', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
        awayTeamDynamic: loserRef('HF1'),
      });
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, [], teams);

      const cell = result.cellsByGameId.get('final')!;
      expect(cell.home).toEqual({ teamLabel: 'Team A', basis: 'projected', sourceGameId: 'sf' });
      expect(cell.away).toEqual({ teamLabel: 'Team B', basis: 'projected', sourceGameId: 'sf' });
    });

    it('resolves arbitrarily deep chains (not capped at 3 passes)', () => {
      // Five sequential rounds: r0 winner feeds r1, r1 winner feeds r2, ... r4.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Bracket', 0);
      const teams: GlobalTeam[] = [team('t0', 'Seed 0'), team('tx', 'Filler')];
      const nodes: FlowNode[] = [f, s];
      nodes.push(
        game('r0', 's1', 'Bracket', 'R0', {
          homeTeamId: 't0',
          awayTeamId: 'tx',
          status: 'Beendet',
          final_score: { home: 10, away: 0 },
        })
      );
      for (let i = 1; i <= 5; i++) {
        nodes.push(
          game(`r${i}`, 's1', 'Bracket', `R${i}`, {
            homeTeamDynamic: winnerRef(`R${i - 1}`),
            awayTeamId: 'tx',
            status: 'Beendet',
            final_score: { home: 10, away: 0 },
          })
        );
      }

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('r5')!.home).toEqual({
        teamLabel: 'Seed 0',
        basis: 'actual',
        sourceGameId: 'r4',
      });
    });

    it('prefers the maintained GameToGameEdge over standing-name matching when both are present', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const sf = game('sf', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 21, away: 14 },
      });
      const final = game('final', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
      });
      const edges: FlowEdge[] = [createGameToGameEdge('e1', 'sf', 'winner', 'final', 'home')];
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, edges, teams);

      expect(result.cellsByGameId.get('final')!.home).toEqual({
        teamLabel: 'Team A',
        basis: 'actual',
        sourceGameId: 'sf',
      });
    });

    it('trusts the edge handle over a disagreeing ref.type, and reports the mismatch', () => {
      // The edge says "loser" (what the user actually wired), but the ref
      // data is stale and still says "winner" — the edge must win, and the
      // disagreement must be surfaced rather than silently resolving the
      // wrong team.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const sf = game('sf', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 21, away: 14 },
      });
      const final = game('final', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
      });
      const edges: FlowEdge[] = [createGameToGameEdge('e1', 'sf', 'loser', 'final', 'home')];
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, edges, teams);

      expect(result.cellsByGameId.get('final')!.home).toEqual({
        teamLabel: 'Team B',
        basis: 'actual',
        sourceGameId: 'sf',
      });
      const finding = result.findings.find((fd) => fd.type === 'reference_mismatch');
      expect(finding).toBeDefined();
      expect(finding!.affectedNodes).toContain('final');
    });
  });

  describe('official references', () => {
    it('resolves an official reference even when it appears before its source game in node order', () => {
      // `official` never gates the fixpoint, so game A (statically assigned,
      // resolvable immediately) must not permanently freeze its official as
      // unresolved just because it's processed before game B settles.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B'), team('t3', 'Team C')];
      const gA = game('gA', 's1', 'Preliminary', 'A', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        official: winnerRef('B'),
      });
      const gB = game('gB', 's1', 'Preliminary', 'B', {
        homeTeamId: 't1',
        awayTeamId: 't3',
        status: 'Beendet',
        final_score: { home: 10, away: 0 },
      });
      // gA appears before gB — reproduces the bug regardless of pass count.
      const nodes: FlowNode[] = [f, s, gA, gB];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('gA')!.official).toEqual({
        teamLabel: 'Team A',
        basis: 'actual',
        sourceGameId: 'gB',
      });
    });
  });

  describe('dangling references', () => {
    it('reports a dangling finding when a winner ref targets a non-existent match', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const g = game('g1', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('Does Not Exist'),
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];
      const teams: GlobalTeam[] = [team('t2', 'Team B')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('g1')!.home.teamLabel).toBeNull();
      const finding = result.findings.find((fd) => fd.type === 'dangling_reference');
      expect(finding).toBeDefined();
      expect(finding!.affectedNodes).toContain('g1');
    });

    it('reports a dangling finding for a rank reference to a non-existent stage', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const g = game('g1', 's1', 'Final', 'Finale', {
        homeTeamDynamic: rankRef('missing-stage', 'Ghost Stage', 1),
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];
      const teams: GlobalTeam[] = [team('t2', 'Team B')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('g1')!.home.teamLabel).toBeNull();
      expect(result.findings.some((fd) => fd.type === 'dangling_reference')).toBe(true);
    });

    it('reports legacy standing/groupTeam reference types as dangling (unsupported in the live canvas graph)', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const g = game('g1', 's1', 'Final', 'Finale', {
        homeTeamDynamic: { type: 'standing', place: 1, groupName: 'Gruppe 1' },
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];
      const teams: GlobalTeam[] = [team('t2', 'Team B')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.some((fd) => fd.type === 'dangling_reference')).toBe(true);
    });

    it('reports a groupTeam reference type as dangling too (also unsupported in the live canvas graph)', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const g = game('g1', 's1', 'Final', 'Finale', {
        homeTeamDynamic: { type: 'groupTeam', group: 0, team: 1 },
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, g];
      const teams: GlobalTeam[] = [team('t2', 'Team B')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.some((fd) => fd.type === 'dangling_reference')).toBe(true);
    });
  });

  describe('cycles', () => {
    it('reports a cycle without crashing or hanging when two games reference each other', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const gA = game('gA', 's1', 'Final', 'A', {
        homeTeamDynamic: winnerRef('B'),
        awayTeamId: 't1',
      });
      const gB = game('gB', 's1', 'Final', 'B', {
        homeTeamDynamic: winnerRef('A'),
        awayTeamId: 't1',
      });
      const nodes: FlowNode[] = [f, s, gA, gB];
      const teams: GlobalTeam[] = [team('t1', 'Team A')];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('gA')!.home.teamLabel).toBeNull();
      expect(result.cellsByGameId.get('gB')!.home.teamLabel).toBeNull();
      expect(result.findings.some((fd) => fd.type === 'unresolved_cycle')).toBe(true);
    });

    it('backtracks cleanly through an acyclic branch before finding the actual cycle', () => {
      // gE depends on both gF (resolves fine, a plain leaf) and gA (cyclic
      // with gB) — the cycle-detection DFS must fully explore gF's subgraph
      // (finding no cycle there) before it reaches gA's cycle.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A')];
      const gF = game('gF', 's1', 'Final', 'F', { homeTeamId: 't1', awayTeamId: 't1' });
      const gA = game('gA', 's1', 'Final', 'A', { homeTeamDynamic: winnerRef('B'), awayTeamId: 't1' });
      const gB = game('gB', 's1', 'Final', 'B', { homeTeamDynamic: winnerRef('A'), awayTeamId: 't1' });
      const gE = game('gE', 's1', 'Final', 'E', {
        homeTeamDynamic: winnerRef('F'),
        awayTeamDynamic: winnerRef('A'),
      });
      const nodes: FlowNode[] = [f, s, gF, gA, gB, gE];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('gE')!.away.teamLabel).toBeNull();
      expect(result.findings.some((fd) => fd.type === 'unresolved_cycle')).toBe(true);
    });

    it('does not fabricate a bogus self-cycle for a game merely downstream of a real cycle', () => {
      // Regression test for a stale-`inStack` bug: gC only *depends on* the
      // gA<->gB cycle (it never resolves either, since gA never does), but
      // must never itself be reported as its own single-node cycle.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A')];
      const gA = game('gA', 's1', 'Final', 'A', { homeTeamDynamic: winnerRef('B'), awayTeamId: 't1' });
      const gB = game('gB', 's1', 'Final', 'B', { homeTeamDynamic: winnerRef('A'), awayTeamId: 't1' });
      const gC = game('gC', 's1', 'Final', 'C', { homeTeamDynamic: winnerRef('A'), awayTeamId: 't1' });
      const nodes: FlowNode[] = [f, s, gA, gB, gC];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('gC')!.home.teamLabel).toBeNull();
      const cycleFindings = result.findings.filter((fd) => fd.type === 'unresolved_cycle');
      expect(cycleFindings).toHaveLength(1);
      expect(cycleFindings[0].affectedNodes.sort()).toEqual(['gA', 'gB']);
      expect(cycleFindings.some((fd) => fd.affectedNodes.length === 1 && fd.affectedNodes[0] === 'gC')).toBe(false);
    });
  });

  describe('ties', () => {
    it('reports an undecided-tie finding when a completed, tied game is referenced downstream', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const sf = game('sf', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 14, away: 14 },
      });
      const final = game('final', 's1', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('final')!.home.teamLabel).toBeNull();
      expect(result.findings.some((fd) => fd.type === 'undecided_tie' && fd.affectedNodes.includes('sf'))).toBe(
        true
      );
    });

    it('falls back to the game id in the tie message when the game has no standing label', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Preliminary', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const sf = game('sf', 's1', 'Preliminary', '', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 14, away: 14 },
      });
      const final = game('final', 's1', 'Final', 'Finale', { homeTeamDynamic: winnerRef('placeholder') });
      // Referenced via an edge (not standing-name matching), since this game has no standing.
      const edges: FlowEdge[] = [createGameToGameEdge('e1', 'sf', 'winner', 'final', 'home')];
      const nodes: FlowNode[] = [f, s, sf, final];

      const result = simulateProgression(nodes, edges, teams);

      const finding = result.findings.find((fd) => fd.type === 'undecided_tie');
      expect(finding).toBeDefined();
      expect(finding!.message).toContain('sf');
    });

    it('does not report an undecided-tie finding for a tied game nothing ever references', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Final', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g = game('g1', 's1', 'Final', 'Finale', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 7, away: 7 },
      });
      const nodes: FlowNode[] = [f, s, g];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.some((fd) => fd.type === 'undecided_tie')).toBe(false);
    });
  });

  describe('rank / groupRank (ranking stages)', () => {
    it('resolves a rank reference using win-points, then point-diff, then points-for tiebreak', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [
        team('t1', 'Team A'),
        team('t2', 'Team B'),
        team('t3', 'Team C'),
      ];
      // Round robin: A beats B (2 wins? just one game each pair for simplicity)
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 20, away: 10 } },
        'RANKING'
      );
      const g2 = game(
        'g2',
        's1',
        'Gruppe 1',
        'G2',
        { homeTeamId: 't2', awayTeamId: 't3', status: 'Beendet', final_score: { home: 15, away: 5 } },
        'RANKING'
      );
      const g3 = game(
        'g3',
        's1',
        'Gruppe 1',
        'G3',
        { homeTeamId: 't1', awayTeamId: 't3', status: 'Beendet', final_score: { home: 25, away: 0 } },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const final = game('final', 's2', 'Final', 'Finale', {
        homeTeamDynamic: rankRef('s1', 'Gruppe 1', 1),
        awayTeamDynamic: rankRef('s1', 'Gruppe 1', 2),
      });
      const nodes: FlowNode[] = [f, s, finalStage, g1, g2, g3, final];

      const result = simulateProgression(nodes, [], teams);

      // A: 2 wins (2*2=4 pts), diff +35; B: 1 win 1 loss (2 pts), diff 0; C: 2 losses (0 pts).
      const cell = result.cellsByGameId.get('final')!;
      expect(cell.home.teamLabel).toBe('Team A');
      expect(cell.away.teamLabel).toBe('Team B');
    });

    it('resolves a groupRank reference scoped to a specific group within a stage', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Vorrunde', 0, 'RANKING');
      const teams: GlobalTeam[] = [
        team('t1', 'Team A'),
        team('t2', 'Team B'),
        team('t3', 'Team C'),
        team('t4', 'Team D'),
      ];
      const gA = game(
        'gA',
        's1',
        'Vorrunde',
        'GA',
        {
          homeTeamId: 't1',
          awayTeamId: 't2',
          status: 'Beendet',
          final_score: { home: 20, away: 5 },
          group: 'Gruppe A',
        },
        'RANKING'
      );
      const gB = game(
        'gB',
        's1',
        'Vorrunde',
        'GB',
        {
          homeTeamId: 't3',
          awayTeamId: 't4',
          status: 'Beendet',
          final_score: { home: 8, away: 7 },
          group: 'Gruppe B',
        },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const crossover = game('cross', 's2', 'Final', 'Crossover', {
        homeTeamDynamic: groupRankRef('s1', 'Vorrunde', 'Gruppe A', 1),
        awayTeamDynamic: groupRankRef('s1', 'Vorrunde', 'Gruppe B', 1),
      });
      const nodes: FlowNode[] = [f, s, finalStage, gA, gB, crossover];

      const result = simulateProgression(nodes, [], teams);

      const cell = result.cellsByGameId.get('cross')!;
      expect(cell.home.teamLabel).toBe('Team A');
      expect(cell.away.teamLabel).toBe('Team C');
    });

    it('falls back to matching by stageName when stageId is empty (e.g. a legacy parsed reference)', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 10, away: 0 } },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const final = game('final', 's2', 'Final', 'Finale', {
        // stageId is empty, as parseTeamReference produces for a string-parsed rank ref.
        homeTeamDynamic: { type: 'rank', place: 1, stageId: '', stageName: 'Gruppe 1' },
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, finalStage, g1, final];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('final')!.home.teamLabel).toBe('Team A');
    });

    it('resolves to null when the requested place exceeds the number of ranked teams', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 10, away: 0 } },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const final = game('final', 's2', 'Final', 'Finale', {
        homeTeamDynamic: rankRef('s1', 'Gruppe 1', 5),
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s, finalStage, g1, final];

      const result = simulateProgression(nodes, [], teams);

      expect(result.cellsByGameId.get('final')!.home.teamLabel).toBeNull();
    });

    it('flags a genuine tie for the referenced place with an ambiguous_standing finding', () => {
      // Team A and Team C never play each other, but both go 1-0 with an
      // identical +10 point difference and 10 points-for — a real,
      // unresolvable tie for 1st place, not just a tie between two teams
      // that played each other.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [
        team('t1', 'Team A'),
        team('t2', 'Team B'),
        team('t3', 'Team C'),
        team('t4', 'Team D'),
      ];
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 10, away: 0 } },
        'RANKING'
      );
      const g2 = game(
        'g2',
        's1',
        'Gruppe 1',
        'G2',
        { homeTeamId: 't3', awayTeamId: 't4', status: 'Beendet', final_score: { home: 10, away: 0 } },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const final = game('final', 's2', 'Final', 'Finale', {
        homeTeamDynamic: rankRef('s1', 'Gruppe 1', 1),
        awayTeamId: 't1',
      });
      const nodes: FlowNode[] = [f, s, finalStage, g1, g2, final];

      const result = simulateProgression(nodes, [], teams);

      const finding = result.findings.find((fd) => fd.type === 'ambiguous_standing');
      expect(finding).toBeDefined();
      expect(finding!.affectedNodes).toContain('final');
      expect(finding!.messageParams).toMatchObject({ place: 1, count: 2 });
    });

    it('does not flag a place that is not part of any tie', () => {
      const f = field('f1');
      const s = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B'), team('t3', 'Team C')];
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 20, away: 10 } },
        'RANKING'
      );
      const g2 = game(
        'g2',
        's1',
        'Gruppe 1',
        'G2',
        { homeTeamId: 't2', awayTeamId: 't3', status: 'Beendet', final_score: { home: 15, away: 5 } },
        'RANKING'
      );
      const g3 = game(
        'g3',
        's1',
        'Gruppe 1',
        'G3',
        { homeTeamId: 't1', awayTeamId: 't3', status: 'Beendet', final_score: { home: 25, away: 0 } },
        'RANKING'
      );
      const finalStage = stage('s2', 'f1', 'Final', 1);
      const final = game('final', 's2', 'Final', 'Finale', {
        homeTeamDynamic: rankRef('s1', 'Gruppe 1', 1),
        awayTeamId: 't1',
      });
      const nodes: FlowNode[] = [f, s, finalStage, g1, g2, g3, final];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.some((fd) => fd.type === 'ambiguous_standing')).toBe(false);
    });
  });

  describe('unreachable placeholders', () => {
    it('flags a non-terminal RANKING stage whose placements nothing ever references', () => {
      const f = field('f1');
      const s1 = stage('s1', 'f1', 'Gruppe 1', 0, 'RANKING');
      const s2 = stage('s2', 'f1', 'Final', 1);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g1 = game(
        'g1',
        's1',
        'Gruppe 1',
        'G1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 10, away: 0 } },
        'RANKING'
      );
      // The final's teams are statically assigned — s1's standings are never referenced.
      const g2 = game('g2', 's2', 'Final', 'Finale', { homeTeamId: 't1', awayTeamId: 't2' });
      const nodes: FlowNode[] = [f, s1, s2, g1, g2];

      const result = simulateProgression(nodes, [], teams);

      const finding = result.findings.find((fd) => fd.type === 'unreachable_placeholder');
      expect(finding).toBeDefined();
      expect(finding!.affectedNodes).toContain('s1');
    });

    it('flags a non-terminal game whose result nothing ever consumes', () => {
      const f = field('f1');
      const s1 = stage('s1', 'f1', 'Preliminary', 0);
      const s2 = stage('s2', 'f1', 'Final', 1);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      // g1's winner/loser is never referenced anywhere, and it's not in the terminal stage.
      const g1 = game('g1', 's1', 'Preliminary', 'Spiel 1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 10, away: 5 },
      });
      const g2 = game('g2', 's2', 'Final', 'Finale', {
        homeTeamId: 't1',
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s1, s2, g1, g2];

      const result = simulateProgression(nodes, [], teams);

      const finding = result.findings.find((fd) => fd.type === 'unreachable_placeholder');
      expect(finding).toBeDefined();
      expect(finding!.affectedNodes).toContain('g1');
    });

    it('does not flag games in the terminal (highest-order) stage', () => {
      const f = field('f1');
      const s1 = stage('s1', 'f1', 'Preliminary', 0);
      const s2 = stage('s2', 'f1', 'Final', 1);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const g1 = game('g1', 's1', 'Preliminary', 'HF1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 10, away: 5 },
      });
      const finalGame = game('final', 's2', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
        awayTeamId: 't2',
      });
      const nodes: FlowNode[] = [f, s1, s2, g1, finalGame];

      const result = simulateProgression(nodes, [], teams);

      expect(
        result.findings.some((fd) => fd.type === 'unreachable_placeholder' && fd.affectedNodes.includes('final'))
      ).toBe(false);
    });

    it('does not flag round-robin/RANKING-stage games even when no individual game references them', () => {
      // A standalone group stage (e.g. "Group 1"/"Group 2" pools) with no
      // playoff bracket wired up yet — completely normal, not a defect.
      const f = field('f1');
      const s = stage('s1', 'f1', 'Group 1', 0, 'RANKING');
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B'), team('t3', 'Team C')];
      const g1 = game(
        'g1',
        's1',
        'Group 1',
        'Game 1',
        { homeTeamId: 't1', awayTeamId: 't2', status: 'Beendet', final_score: { home: 20, away: 10 } },
        'RANKING'
      );
      const g2 = game(
        'g2',
        's1',
        'Group 1',
        'Game 2',
        { homeTeamId: 't2', awayTeamId: 't3', status: 'Beendet', final_score: { home: 15, away: 5 } },
        'RANKING'
      );
      const nodes: FlowNode[] = [f, s, g1, g2];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.filter((fd) => fd.type === 'unreachable_placeholder')).toHaveLength(0);
    });

    it('does not flag a field whose own (short) stage sequence is already terminal, even if another field has more rounds', () => {
      // Field A: a single, standalone stage (its own terminal round).
      // Field B: two stages, so the GLOBAL max stage order is 1, not 0 —
      // Field A's stage must not be judged against Field B's depth.
      const fA = field('fA', 0);
      const sA = stage('sA', 'fA', 'Group A', 0);
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const gA = game('gA', 'sA', 'Group A', 'Spiel A', {
        homeTeamId: 't1',
        awayTeamId: 't2',
        status: 'Beendet',
        final_score: { home: 10, away: 5 },
      });

      const fB = field('fB', 1);
      const sB1 = stage('sB1', 'fB', 'Preliminary', 0);
      const sB2 = stage('sB2', 'fB', 'Final', 1);
      // Inserted after sB2 despite a lower order, so computing field B's max
      // exercises both outcomes of "is this stage's order higher than the
      // max seen so far" (not just always-increasing insertion order).
      const sB0 = stage('sB0', 'fB', 'Also Preliminary', 0);
      const gB1 = game('gB1', 'sB1', 'Preliminary', 'HF1', { homeTeamId: 't1', awayTeamId: 't2' });
      const gB2 = game('gB2', 'sB2', 'Final', 'Finale', {
        homeTeamDynamic: winnerRef('HF1'),
        awayTeamId: 't2',
      });

      const nodes: FlowNode[] = [fA, sA, gA, fB, sB1, sB2, sB0, gB1, gB2];

      const result = simulateProgression(nodes, [], teams);

      expect(
        result.findings.some((fd) => fd.type === 'unreachable_placeholder' && fd.affectedNodes.includes('gA'))
      ).toBe(false);
    });

    it('treats a game with no parent stage as terminal (defensive default), never flagging it', () => {
      const f = field('f1');
      const orphan: GameNode = game('orphan', 'missing-stage', 'Preliminary', 'Spiel 1', {
        homeTeamId: 't1',
        awayTeamId: 't2',
      });
      delete (orphan as { parentId?: string }).parentId;
      const teams: GlobalTeam[] = [team('t1', 'Team A'), team('t2', 'Team B')];
      const nodes: FlowNode[] = [f, orphan];

      const result = simulateProgression(nodes, [], teams);

      expect(result.findings.some((fd) => fd.type === 'unreachable_placeholder')).toBe(false);
    });
  });

  describe('empty graph', () => {
    it('returns an empty result for no nodes', () => {
      const result = simulateProgression([], [], []);
      expect(result.cellsByGameId.size).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });
});
