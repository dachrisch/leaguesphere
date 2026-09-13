/**
 * Progression Simulator (Expert Mode)
 *
 * Simulates how the current bracket/schedule graph would resolve if played to
 * completion, tracing `winner` / `loser` / `rank` / `groupRank` TeamReferences
 * end-to-end — unlike `bracketResolution.ts`'s live `resolvedHomeTeam`/
 * `resolvedAwayTeam` preview, which only resolves references whose source game
 * has ALREADY completed, only understands `winner`/`loser`, and uses a
 * hardcoded 3-pass loop.
 *
 * Resolution is a topological fixpoint over two kinds of "units":
 *  - a game is resolved once both its home and away slots are resolved
 *    (from which its winner/loser can immediately be derived — from a real
 *    result if the game is completed, or a documented deterministic
 *    projection ("home wins") otherwise);
 *  - a stage is resolved once every game it directly contains is resolved,
 *    at which point its rank/groupRank standings can be computed.
 * Each pass resolves at least one previously-unresolved unit or the loop
 * stops, so it always terminates in at most `games + stages` passes — no
 * fixed pass cap, and no guessing at how deep a bracket might go.
 *
 * Every resolved slot carries a `basis`: `'actual'` when it reflects a result
 * that has already happened, `'projected'` when it's a hypothetical
 * "if this game were won by the home team" projection used purely so deeper
 * slots can still be traced.
 *
 * This module also produces expert-only, non-blocking correctness findings
 * (dangling references, unreachable placeholders, unresolved cycles,
 * undecided ties) — see `src/types/progression.ts` for why these are
 * deliberately NOT part of `FlowValidationResult`.
 *
 * IMPORTANT: the output of this module must never be written back onto
 * `node.data` (the way `resolvedHomeTeam`/`resolvedAwayTeam` are) — it must
 * stay in separate, client-only state so it can never round-trip through
 * `exportState()`/`saveData` into the shared, persisted `FlowState`. See
 * `useProgressionInspection.ts`.
 */

import type { FlowNode, FlowEdge, GameNode, StageNode, GlobalTeam } from '../types/flowchart';
import { isGameNode, isStageNode } from '../types/flowchart';
import type { TeamReference } from '../types/designer';
import { getTeamReferenceDisplayName } from './teamReference';
import { findSourceGameForReference } from './edgeAnalysis';
import type {
  ProgressionSimulationResult,
  GameProgressionCellResult,
  ResolvedSlot,
  ResolutionBasis,
  ProgressionFinding,
} from '../types/progression';
import { createEmptyProgressionSimulationResult } from '../types/progression';

type Slot = 'home' | 'away' | 'official';

/**
 * How a single home/away/official slot depends on the rest of the graph,
 * classified once upfront (before any resolution happens) — this is where
 * dangling references and unsupported legacy reference types are identified.
 */
type SlotDependency =
  | { kind: 'none' }
  | { kind: 'static'; teamId: string }
  | { kind: 'literal'; name: string }
  | { kind: 'gameRef'; gameId: string; outputType: 'winner' | 'loser' }
  | { kind: 'stageRef'; stageId: string; place: number; groupName?: string }
  | { kind: 'unsupported'; refLabel: string }
  | { kind: 'dangling'; refLabel: string };

interface Stat {
  winPoints: number;
  pf: number;
  pa: number;
}

/**
 * Simulates the full bracket/schedule graph and returns, for every game, its
 * simulated home/away/official teams plus every expert-only correctness
 * finding. Pure function — safe to call from a `useMemo`.
 */
export function simulateProgression(
  nodes: FlowNode[],
  edges: FlowEdge[],
  globalTeams: GlobalTeam[]
): ProgressionSimulationResult {
  const gameNodes = nodes.filter(isGameNode);
  const stageNodes = nodes.filter(isStageNode);
  if (gameNodes.length === 0) {
    return createEmptyProgressionSimulationResult();
  }

  const teamLabelById = new Map(globalTeams.map((t) => [t.id, t.label]));
  const gameById = new Map(gameNodes.map((g) => [g.id, g]));
  const stageById = new Map(stageNodes.map((s) => [s.id, s]));
  const stageByName = new Map(stageNodes.map((s) => [s.data.name, s]));

  // Standings can legitimately be duplicated (flagged elsewhere by the main
  // validator's `duplicate_standing` warning) — when a winner/loser ref has no
  // corresponding edge, fall back to the first game with a matching standing.
  const standingToGames = new Map<string, GameNode[]>();
  for (const g of gameNodes) {
    if (!g.data.standing) continue;
    const list = standingToGames.get(g.data.standing) ?? [];
    list.push(g);
    standingToGames.set(g.data.standing, list);
  }

  const stageGames = new Map<string, GameNode[]>();
  for (const s of stageNodes) stageGames.set(s.id, []);
  for (const g of gameNodes) {
    if (!g.parentId) continue;
    const list = stageGames.get(g.parentId);
    if (list) list.push(g);
  }

  const resolveStageForRef = (ref: { stageId: string; stageName: string }): StageNode | undefined =>
    stageById.get(ref.stageId) ?? stageByName.get(ref.stageName);

  /**
   * Classifies one slot's TeamReference into what it depends on.
   * Prefers the maintained `GameToGameEdge` (unambiguous, immune to
   * duplicate-standing names) for winner/loser refs, falling back to
   * matching by `standing`/`matchName` when no edge exists (e.g. imported
   * or template-converted graphs) — and only reports `dangling` when
   * neither resolves anything.
   */
  const classify = (game: GameNode, slot: Slot, ref: TeamReference | null, teamId: string | null): SlotDependency => {
    if (!ref) {
      return teamId ? { kind: 'static', teamId } : { kind: 'none' };
    }
    switch (ref.type) {
      case 'static':
        return { kind: 'literal', name: ref.name };
      case 'winner':
      case 'loser': {
        const bySlot = slot === 'home' || slot === 'away' ? slot : null;
        const viaEdge = bySlot ? findSourceGameForReference(game.id, bySlot, edges, nodes) : null;
        const sourceGame = viaEdge ?? standingToGames.get(ref.matchName)?.[0] ?? null;
        if (!sourceGame) {
          return { kind: 'dangling', refLabel: getTeamReferenceDisplayName(ref) };
        }
        return { kind: 'gameRef', gameId: sourceGame.id, outputType: ref.type };
      }
      case 'rank': {
        const stage = resolveStageForRef(ref);
        if (!stage) return { kind: 'dangling', refLabel: getTeamReferenceDisplayName(ref) };
        return { kind: 'stageRef', stageId: stage.id, place: ref.place };
      }
      case 'groupRank': {
        const stage = resolveStageForRef(ref);
        if (!stage) return { kind: 'dangling', refLabel: getTeamReferenceDisplayName(ref) };
        return { kind: 'stageRef', stageId: stage.id, place: ref.place, groupName: ref.groupName };
      }
      case 'groupTeam':
      case 'standing':
        // Legacy reference shapes that only exist transiently during
        // template/JSON import in this v2 graph — never actually wired to a
        // live producer, so treat as unsupported/dangling rather than crash.
        return { kind: 'unsupported', refLabel: getTeamReferenceDisplayName(ref) };
    }
  };

  const slotDeps = new Map<string, SlotDependency>();
  const findings: ProgressionFinding[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${seq++}`;

  const refFor = (game: GameNode, slot: Slot): TeamReference | null =>
    slot === 'home' ? game.data.homeTeamDynamic : slot === 'away' ? game.data.awayTeamDynamic : game.data.official;
  const teamIdFor = (game: GameNode, slot: Slot): string | null =>
    slot === 'home' ? game.data.homeTeamId : slot === 'away' ? game.data.awayTeamId : null;

  for (const g of gameNodes) {
    for (const slot of ['home', 'away', 'official'] as const) {
      const dep = classify(g, slot, refFor(g, slot), teamIdFor(g, slot));
      slotDeps.set(`${g.id}:${slot}`, dep);
      if (dep.kind === 'dangling' || dep.kind === 'unsupported') {
        findings.push({
          id: nextId('progression_dangling'),
          type: 'dangling_reference',
          message: `"${g.data.standing || g.id}" references "${dep.refLabel}" for ${slot}, but nothing in the schedule produces it.`,
          messageKey: 'dangling_reference',
          messageParams: { game: g.data.standing || g.id, target: dep.refLabel, slot },
          affectedNodes: [g.id],
        });
      }
    }
  }

  // Dependency edges for the fixpoint (home/away only — official never gates
  // anything downstream), plus a "who references this producer" index used
  // both for cycle detection and the unreachable-placeholder check below.
  const gameDependsOnGames = new Map<string, Set<string>>();
  const gameDependsOnStages = new Map<string, Set<string>>();
  const referencedGameIds = new Set<string>();
  const referencedStageIds = new Set<string>();

  for (const g of gameNodes) {
    for (const slot of ['home', 'away', 'official'] as const) {
      const dep = slotDeps.get(`${g.id}:${slot}`)!;
      if (dep.kind === 'gameRef') {
        referencedGameIds.add(dep.gameId);
        if (slot !== 'official') {
          const set = gameDependsOnGames.get(g.id) ?? new Set<string>();
          set.add(dep.gameId);
          gameDependsOnGames.set(g.id, set);
        }
      } else if (dep.kind === 'stageRef') {
        referencedStageIds.add(dep.stageId);
        if (slot !== 'official') {
          const set = gameDependsOnStages.get(g.id) ?? new Set<string>();
          set.add(dep.stageId);
          gameDependsOnStages.set(g.id, set);
        }
      }
    }
  }

  // --- Fixpoint resolution ---
  const resolvedGameIds = new Set<string>();
  const resolvedStageIds = new Set<string>();
  const gameOutcome = new Map<string, { winner: ResolvedSlot | null; loser: ResolvedSlot | null; tie: boolean }>();
  const stageStandings = new Map<string, string[]>();
  const stageGroupStandings = new Map<string, Map<string, string[]>>();
  const stageBasis = new Map<string, ResolutionBasis>();
  const cells = new Map<string, GameProgressionCellResult>();

  const resolveSlot = (game: GameNode, slot: Slot): ResolvedSlot => {
    const dep = slotDeps.get(`${game.id}:${slot}`)!;
    switch (dep.kind) {
      case 'none':
      case 'dangling':
      case 'unsupported':
        return { teamLabel: null, basis: null };
      case 'static':
        return { teamLabel: teamLabelById.get(dep.teamId) ?? dep.teamId, basis: 'actual' };
      case 'literal':
        return { teamLabel: dep.name, basis: 'actual' };
      case 'gameRef': {
        const outcome = gameOutcome.get(dep.gameId);
        const picked = outcome ? (dep.outputType === 'winner' ? outcome.winner : outcome.loser) : null;
        return picked
          ? { ...picked, sourceGameId: dep.gameId }
          : { teamLabel: null, basis: null, sourceGameId: dep.gameId };
      }
      case 'stageRef': {
        const labels = dep.groupName
          ? stageGroupStandings.get(dep.stageId)?.get(dep.groupName)
          : stageStandings.get(dep.stageId);
        const label = labels?.[dep.place - 1] ?? null;
        return {
          teamLabel: label,
          basis: label ? stageBasis.get(dep.stageId) ?? null : null,
          sourceStageId: dep.stageId,
        };
      }
    }
  };

  const resolveGame = (game: GameNode) => {
    const home = resolveSlot(game, 'home');
    const away = resolveSlot(game, 'away');
    let winner: ResolvedSlot | null = null;
    let loser: ResolvedSlot | null = null;
    let tie = false;

    if (home.teamLabel && away.teamLabel) {
      const isCompleted = game.data.status === 'COMPLETED' || game.data.status === 'Beendet';
      const score = game.data.final_score;
      const bothActual = home.basis === 'actual' && away.basis === 'actual';
      if (isCompleted && score && bothActual && score.home !== score.away) {
        const homeWon = score.home > score.away;
        winner = { teamLabel: homeWon ? home.teamLabel : away.teamLabel, basis: 'actual' };
        loser = { teamLabel: homeWon ? away.teamLabel : home.teamLabel, basis: 'actual' };
      } else if (isCompleted && score && bothActual && score.home === score.away) {
        tie = true;
      } else {
        // Deterministic, documented projection so downstream slots can still
        // be traced through an unplayed game: the home team is projected to win.
        winner = { teamLabel: home.teamLabel, basis: 'projected' };
        loser = { teamLabel: away.teamLabel, basis: 'projected' };
      }
    }

    gameOutcome.set(game.id, { winner, loser, tie });
    // `official` is deliberately resolved in a separate final pass (see
    // below), not here: unlike home/away, it never gates the fixpoint, so a
    // game can (and often does) become resolvable before whatever its own
    // official reference points to has settled. Resolving it eagerly here —
    // a one-shot computation, since a game is only ever visited once — would
    // permanently freeze it as unresolved even when the reference is
    // perfectly valid and would resolve fine once the rest of the graph settles.
    cells.set(game.id, { gameId: game.id, home, away, official: { teamLabel: null, basis: null }, findings: [] });
    resolvedGameIds.add(game.id);
  };

  const rank = (stats: Map<string, Stat>): string[] =>
    Array.from(stats.entries())
      .sort(([, a], [, b]) => {
        if (b.winPoints !== a.winPoints) return b.winPoints - a.winPoints;
        const diffA = a.pf - a.pa;
        const diffB = b.pf - b.pa;
        if (diffB !== diffA) return diffB - diffA;
        return b.pf - a.pf;
      })
      .map(([label]) => label);

  const accumulate = (stats: Map<string, Stat>, label: string, forPts: number, againstPts: number) => {
    const s = stats.get(label) ?? { winPoints: 0, pf: 0, pa: 0 };
    s.winPoints += forPts > againstPts ? 2 : forPts === againstPts ? 1 : 0;
    s.pf += forPts;
    s.pa += againstPts;
    stats.set(label, s);
  };

  /**
   * Ranks the teams of a stage once every game in it is resolved. Tiebreak
   * order (win points 2/1/0, then point diff, then points-for) is copied
   * verbatim from the backend's
   * `gamedays/service/canvas_progression_service.py::_compute_stage_standings`
   * — keep these in sync if that logic ever changes.
   */
  const computeStageStandings = (stage: StageNode) => {
    const games = stageGames.get(stage.id) ?? [];
    const stats = new Map<string, Stat>();
    const groupStats = new Map<string, Map<string, Stat>>();
    let anyProjected = false;
    let anyContributed = false;

    for (const g of games) {
      const cell = cells.get(g.id);
      const outcome = gameOutcome.get(g.id);
      if (!cell || !outcome || !cell.home.teamLabel || !cell.away.teamLabel) continue;
      anyContributed = true;

      const isCompleted = g.data.status === 'COMPLETED' || g.data.status === 'Beendet';
      const score = g.data.final_score;
      const bothActual = cell.home.basis === 'actual' && cell.away.basis === 'actual';
      let homeTotal: number;
      let awayTotal: number;
      if (isCompleted && score && bothActual) {
        homeTotal = score.home;
        awayTotal = score.away;
      } else {
        anyProjected = true;
        homeTotal = 1; // synthetic projected score: home "wins" by the same convention as game outcomes
        awayTotal = 0;
      }

      accumulate(stats, cell.home.teamLabel, homeTotal, awayTotal);
      accumulate(stats, cell.away.teamLabel, awayTotal, homeTotal);
      if (g.data.group) {
        const groupMap = groupStats.get(g.data.group) ?? new Map<string, Stat>();
        accumulate(groupMap, cell.home.teamLabel, homeTotal, awayTotal);
        accumulate(groupMap, cell.away.teamLabel, awayTotal, homeTotal);
        groupStats.set(g.data.group, groupMap);
      }
    }

    stageStandings.set(stage.id, rank(stats));
    const groupRanked = new Map<string, string[]>();
    for (const [groupName, groupMap] of groupStats) groupRanked.set(groupName, rank(groupMap));
    stageGroupStandings.set(stage.id, groupRanked);
    stageBasis.set(stage.id, anyProjected || !anyContributed ? 'projected' : 'actual');
  };

  const canResolveGame = (g: GameNode): boolean => {
    for (const id of gameDependsOnGames.get(g.id) ?? []) if (!resolvedGameIds.has(id)) return false;
    for (const id of gameDependsOnStages.get(g.id) ?? []) if (!resolvedStageIds.has(id)) return false;
    return true;
  };

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const g of gameNodes) {
      if (!resolvedGameIds.has(g.id) && canResolveGame(g)) {
        resolveGame(g);
        progressed = true;
      }
    }
    for (const s of stageNodes) {
      if (resolvedStageIds.has(s.id)) continue;
      const games = stageGames.get(s.id) ?? [];
      if (games.every((g) => resolvedGameIds.has(g.id))) {
        computeStageStandings(s);
        resolvedStageIds.add(s.id);
        progressed = true;
      }
    }
  }

  // --- Cycle detection over whatever the fixpoint couldn't settle ---
  // A finite DAG always fully resolves via the loop above, so anything left
  // unresolved is entangled with (or downstream of) an actual cycle. Reuse
  // the DFS-with-inStack pattern from `useFlowValidation.ts`'s
  // `checkCircularDependencies`, generalized to games *and* stages.
  type UnitKey = `game:${string}` | `stage:${string}`;
  const gameKey = (id: string): UnitKey => `game:${id}`;
  const stageKey = (id: string): UnitKey => `stage:${id}`;
  const unitDeps = new Map<UnitKey, Set<UnitKey>>();
  const addUnitDep = (from: UnitKey, to: UnitKey) => {
    const set = unitDeps.get(from) ?? new Set<UnitKey>();
    set.add(to);
    unitDeps.set(from, set);
  };
  for (const [gameId, deps] of gameDependsOnGames) for (const dep of deps) addUnitDep(gameKey(gameId), gameKey(dep));
  for (const [gameId, deps] of gameDependsOnStages) for (const dep of deps) addUnitDep(gameKey(gameId), stageKey(dep));
  for (const [stageId, games] of stageGames) for (const g of games) addUnitDep(stageKey(stageId), gameKey(g.id));

  const unitLabel = (key: UnitKey): string =>
    key.startsWith('game:') ? gameById.get(key.slice(5))?.data.standing || key : stageById.get(key.slice(6))?.data.name || key;

  const visited = new Set<UnitKey>();
  const inStack = new Set<UnitKey>();
  const findCycle = (key: UnitKey, path: UnitKey[]): UnitKey[] | null => {
    if (inStack.has(key)) return path.slice(path.indexOf(key));
    if (visited.has(key)) return null;
    visited.add(key);
    inStack.add(key);
    for (const dep of unitDeps.get(key) ?? []) {
      const cycle = findCycle(dep, [...path, key]);
      if (cycle) return cycle;
    }
    inStack.delete(key);
    return null;
  };

  for (const g of gameNodes) {
    if (resolvedGameIds.has(g.id) || visited.has(gameKey(g.id))) continue;
    const cycle = findCycle(gameKey(g.id), []);
    if (!cycle) continue;
    const affectedNodes = cycle.map((k) => k.slice(k.indexOf(':') + 1));
    const labels = cycle.map(unitLabel);
    findings.push({
      id: nextId('progression_cycle'),
      type: 'unresolved_cycle',
      message: `Circular progression: ${labels.join(' → ')} → ${labels[0]}`,
      messageKey: 'unresolved_cycle',
      messageParams: { chain: labels },
      affectedNodes,
    });
  }

  // Force a cell for any game the fixpoint never reached (stuck in/behind a
  // cycle) so the UI can still render a "blocked" state — no further
  // cascading happens since nothing loops again after this.
  for (const g of gameNodes) {
    if (!resolvedGameIds.has(g.id)) resolveGame(g);
  }

  // Now that every game/stage has settled (or is known to be permanently
  // stuck behind a cycle), resolve `official` refs in one final pass — safe
  // to do now since nothing downstream depends on an official assignment.
  for (const g of gameNodes) {
    const cell = cells.get(g.id);
    if (cell) cell.official = resolveSlot(g, 'official');
  }

  // --- Unreachable placeholders ---
  // A stage is "terminal" when it's the highest-order stage WITHIN ITS OWN
  // FIELD (a "Finale" legitimately has no downstream consumer) — computed
  // per field, not globally, so a short field (e.g. a single group stage)
  // isn't misflagged just because some other field has more rounds.
  const maxStageOrderByFieldId = new Map<string, number>();
  for (const s of stageNodes) {
    if (!s.parentId) continue;
    const current = maxStageOrderByFieldId.get(s.parentId);
    if (current === undefined || s.data.order > current) maxStageOrderByFieldId.set(s.parentId, s.data.order);
  }
  const isTerminalStage = (stage: StageNode | undefined): boolean => {
    if (!stage || !stage.parentId) return true;
    const fieldMax = maxStageOrderByFieldId.get(stage.parentId);
    return fieldMax === undefined || stage.data.order === fieldMax;
  };

  for (const g of gameNodes) {
    if (!g.data.standing) continue;
    const stage = g.parentId ? stageById.get(g.parentId) : undefined;
    // RANKING-stage games (round-robin/group play) are consumed in aggregate
    // via the stage's `rank`/`groupRank` standings, never individually by
    // winner/loser — that's checked separately below, per stage. Flagging
    // each game here would be a false positive on every ordinary group stage.
    if (isTerminalStage(stage) || referencedGameIds.has(g.id) || stage?.data.stageType === 'RANKING') continue;
    findings.push({
      id: nextId('progression_unreachable'),
      type: 'unreachable_placeholder',
      message: `"${g.data.standing}" is never referenced by any later game or official assignment.`,
      messageKey: 'unreachable_placeholder',
      messageParams: { game: g.data.standing },
      affectedNodes: [g.id],
    });
  }
  for (const s of stageNodes) {
    if (isTerminalStage(s) || s.data.stageType !== 'RANKING' || referencedStageIds.has(s.id)) continue;
    findings.push({
      id: nextId('progression_unreachable_stage'),
      type: 'unreachable_placeholder',
      message: `Ranking stage "${s.data.name}" computes placements that no game ever references.`,
      messageKey: 'unreachable_placeholder_stage',
      messageParams: { stage: s.data.name },
      affectedNodes: [s.id],
    });
  }

  // --- Undecided ties ---
  for (const [gameId, outcome] of gameOutcome) {
    if (outcome.tie && referencedGameIds.has(gameId)) {
      findings.push({
        id: nextId('progression_tie'),
        type: 'undecided_tie',
        message: `"${gameById.get(gameId)?.data.standing || gameId}" ended in a tie, so its winner/loser cannot be determined.`,
        messageKey: 'undecided_tie',
        messageParams: { game: gameById.get(gameId)?.data.standing || gameId },
        affectedNodes: [gameId],
      });
    }
  }

  // Attach every finding to the cell(s) of any game it affects, for the
  // per-row tooltip; stage-only findings simply don't attach to a game cell.
  for (const finding of findings) {
    for (const nodeId of finding.affectedNodes) {
      cells.get(nodeId)?.findings.push(finding);
    }
  }

  return { cellsByGameId: cells, findings };
}
