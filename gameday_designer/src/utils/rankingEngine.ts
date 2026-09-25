import type { FlowNode, GameNode, StageNode } from '../types/flowchart';
import { isGameNode, isStageNode } from '../types/flowchart';

/**
 * Result of ranking calculation.
 * List of team IDs in order.
 */
export type RankingResult = string[];

/**
 * Identifies all unique teams participating in a set of games.
 * 
 * @param games - List of game nodes
 * @returns Array of unique team IDs (GlobalTeam.id)
 */
export function getStageParticipants(games: GameNode[]): string[] {
  const participants = new Set<string>();
  
  games.forEach(game => {
    if (game.data.homeTeamId) participants.add(game.data.homeTeamId);
    if (game.data.awayTeamId) participants.add(game.data.awayTeamId);
  });
  
  return Array.from(participants);
}

/**
 * Identifies all unique group names participating in a set of games.
 */
export function getStageGroups(games: GameNode[]): string[] {
  const groups = new Set<string>();
  
  games.forEach(game => {
    if (game.data.group) {
      groups.add(game.data.group);
    }
  });
  
  return Array.from(groups).sort();
}

/**
 * Identifies all unique teams participating in a specific group.
 */
export function getGroupParticipants(games: GameNode[], groupName: string): string[] {
  const participants = new Set<string>();
  
  games.filter(g => g.data.group === groupName).forEach(game => {
    if (game.data.homeTeamId) participants.add(game.data.homeTeamId);
    if (game.data.awayTeamId) participants.add(game.data.awayTeamId);
  });
  
  return Array.from(participants);
}

/**
 * A "Ranking" stage as it should appear to the person building the schedule,
 * merging every StageNode that shares its name (e.g. one instance per field)
 * into a single entry with the combined participant list. Without this
 * merge, splitting one group's games across two fields makes each field's
 * StageNode instance list only its own half of the group's teams, and the
 * same stage name would appear twice in any "Nth place of this stage" picker.
 */
export interface MergedRankingStage {
  name: string;
  /** ids of every StageNode instance sharing this name */
  stageIds: string[];
  color?: string;
  participants: string[];
  groups: { name: string; participants: string[] }[];
}

/**
 * Builds the merged, by-name view of every RANKING-type stage in the graph,
 * combining games from all StageNode instances that share a name regardless
 * of which field they were created under.
 *
 * @param excludeStageId - when set, drops the merged group containing this
 *   stage id (used to prevent a game from referencing its own stage's rank).
 */
export function getMergedRankingStages(
  allNodes: FlowNode[],
  excludeStageId?: string
): MergedRankingStage[] {
  const stagesByName = new Map<string, StageNode[]>();
  allNodes
    .filter((n): n is StageNode => isStageNode(n) && n.data.stageType === 'RANKING')
    .forEach((stage) => {
      const list = stagesByName.get(stage.data.name) ?? [];
      list.push(stage);
      stagesByName.set(stage.data.name, list);
    });

  const merged: MergedRankingStage[] = [];
  stagesByName.forEach((stages, name) => {
    const stageIds = stages.map((s) => s.id);
    if (excludeStageId && stageIds.includes(excludeStageId)) return;

    const games = allNodes.filter(
      (n): n is GameNode => isGameNode(n) && !!n.parentId && stageIds.includes(n.parentId)
    );

    merged.push({
      name,
      stageIds,
      color: stages[0].data.color,
      participants: getStageParticipants(games),
      groups: getStageGroups(games).map((groupName) => ({
        name: groupName,
        participants: getGroupParticipants(games, groupName),
      })),
    });
  });

  return merged;
}

/**
 * Calculates the ranking for a Ranking Stage.
 * 
 * NOTE: In the DESIGN phase, we don't have game scores.
 * The ranking here represents the "slots" available for selection by subsequent stages.
 * By default, it returns the participants in alphabetical or order-based sequence.
 * 
 * @param games - List of game nodes in the stage
 * @returns Ordered list of team IDs
 */
export function calculateRanking(games: GameNode[]): RankingResult {
  // Extract all unique participants
  const participants = getStageParticipants(games);
  
  // For the designer, we just need a consistent list of "available ranks".
  // Sorting for predictability in the UI.
  return participants.sort();
}
