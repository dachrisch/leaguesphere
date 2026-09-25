import type { FlowNode, GameNode } from '../types/flowchart';
import { isFieldNode, isGameNode, isStageNode } from '../types/flowchart';
import type { GameResultsDisplay } from '../types/designer';

/**
 * Builds a lookup key correlating a canvas game node to its backend Gameinfo
 * row. `standing` alone is not reliable: preliminary/group-stage games
 * commonly share one standing value across the whole group (the same
 * convention the backend's own stage-standings computation relies on), so
 * several canvas games can have an identical standing. Stage name + standing
 * + field number + start time together are exactly the fields
 * CanvasPublishService.apply() used to create the Gameinfo row in the first
 * place, so this is unique for any schedule where no two games share a field
 * at the same instant.
 */
function buildMatchKey(stage: string, standing: string, field: number, startTime: string): string {
  return `${stage}|${standing}|${field}|${startTime.slice(0, 5)}`;
}

/**
 * Indexes every canvas game node by its match key, resolving the stage name
 * and field number the same way CanvasPublishService.apply() does: via the
 * game's parent Stage node, and that stage's parent Field node's `order`.
 */
export function buildGameNodeMatchIndex(allNodes: FlowNode[]): Map<string, GameNode> {
  const index = new Map<string, GameNode>();

  allNodes.filter(isGameNode).forEach((game) => {
    if (!game.parentId || !game.data.startTime) return;
    const stageNode = allNodes.find((n) => n.id === game.parentId);
    if (!stageNode || !isStageNode(stageNode)) return;
    const fieldNode = stageNode.parentId ? allNodes.find((n) => n.id === stageNode.parentId) : undefined;
    if (!fieldNode || !isFieldNode(fieldNode)) return;

    const fieldNumber = fieldNode.data.order + 1;
    const key = buildMatchKey(stageNode.data.name, game.data.standing, fieldNumber, game.data.startTime);
    index.set(key, game);
  });

  return index;
}

/**
 * Matches each backend game (from GET /gamedays/<id>/games/) to its canvas
 * node, returning one entry per game that resolved to a real node.
 */
export function matchGamesToNodes(
  allNodes: FlowNode[],
  games: GameResultsDisplay[]
): { node: GameNode; gameinfoId: number }[] {
  const index = buildGameNodeMatchIndex(allNodes);

  return games
    .map((game) => {
      const key = buildMatchKey(game.stage, game.standing, game.field, game.scheduled);
      const node = index.get(key);
      return node ? { node, gameinfoId: game.id } : null;
    })
    .filter((entry): entry is { node: GameNode; gameinfoId: number } => entry !== null);
}
