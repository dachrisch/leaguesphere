/**
 * GameTable Component
 *
 * Displays games in a stage as a table.
 * Shows team assignments via dropdown selectors or dynamic refs from edges.
 * Clicking a row selects the game for editing in the properties panel.
 */

import React from 'react';
import { Table, Form, Badge, Button } from 'react-bootstrap';
import type { GameNode, FlowEdge, FlowNode, GlobalTeam, GameNodeData } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';
import { formatTeamReference } from '../../utils/teamReference';
import { findSourceGameForReference, getGamePath } from '../../utils/edgeAnalysis';
import './GameTable.css';

export interface GameTableProps {
  games: GameNode[];
  edges: FlowEdge[];
  allNodes: FlowNode[];
  globalTeams: GlobalTeam[];
  onUpdate: (nodeId: string, data: Partial<GameNode['data']>) => void;
  onDelete: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  highlightedSourceGameId: string | null;
  onDynamicReferenceClick: (sourceGameId: string, targetGameId: string, targetSlot: 'home' | 'away') => void;
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  onRemoveGameToGameEdge: (targetGameId: string, targetSlot: 'home' | 'away') => void;
}

const GameTable: React.FC<GameTableProps> = ({
  games,
  edges,
  allNodes,
  globalTeams,
  onDelete,
  onSelectNode,
  selectedNodeId,
  onAssignTeam,
  highlightedSourceGameId,
  onDynamicReferenceClick,
  onAddGameToGameEdge,
  onRemoveGameToGameEdge,
}) => {
  if (games.length === 0) {
    return (
      <div className="text-muted text-center py-2">
        <i className="bi bi-trophy me-2"></i>
        No games in this stage.
      </div>
    );
  }

  const handleRowClick = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent bubbling to parent containers
    onSelectNode(gameId);
  };

  const handleDelete = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent row selection
    if (window.confirm('Delete this game?')) {
      onDelete(gameId);
    }
  };

  /**
   * Get eligible source games for dynamic references.
   * Only include games from stages with lower order.
   */
  const getEligibleSourceGames = (targetGame: GameNode): GameNode[] => {
    const targetPath = getGamePath(targetGame.id, allNodes);
    if (!targetPath) return [];

    const targetStageOrder = targetPath.stage.data.order;

    return allNodes
      .filter((node): node is GameNode => {
        if (!isGameNode(node)) return false;
        if (node.id === targetGame.id) return false;

        const path = getGamePath(node.id, allNodes);
        if (!path) return false;

        // Only show games from earlier stages (lower order)
        return path.stage.data.order < targetStageOrder;
      })
      .sort((a, b) => {
        const pathA = getGamePath(a.id, allNodes)!;
        const pathB = getGamePath(b.id, allNodes)!;
        return pathA.stage.data.order - pathB.stage.data.order;
      });
  };

  /**
   * Handle team/reference selection from dropdown.
   */
  const handleTeamChange = (gameId: string, slot: 'home' | 'away', value: string) => {
    if (!value) {
      // Clear selection
      onRemoveGameToGameEdge(gameId, slot);
      return;
    }

    if (value.startsWith('winner:') || value.startsWith('loser:')) {
      // Dynamic reference selected
      const [outputType, sourceGameId] = value.split(':');
      onAddGameToGameEdge(sourceGameId, outputType as 'winner' | 'loser', gameId, slot);
    } else {
      // Static team selected
      onRemoveGameToGameEdge(gameId, slot);
      onAssignTeam(gameId, value, slot);
    }
  };

  // Get official team display
  const getOfficialDisplay = (game: GameNode): string => {
    if (!game.data.official) return '-';
    return formatTeamReference(game.data.official);
  };

  // Render team cell (either dropdown or dynamic ref badge)
  const renderTeamCell = (game: GameNode, slot: 'home' | 'away') => {
    const data = game.data as GameNodeData;
    const dynamicRef = slot === 'home' ? data.homeTeamDynamic : data.awayTeamDynamic;
    const teamId = slot === 'home' ? data.homeTeamId : data.awayTeamId;

    // Priority 1: Show dynamic reference badge (if exists)
    if (dynamicRef) {
      const sourceGame = findSourceGameForReference(game.id, slot, edges, allNodes);

      return (
        <div className="d-flex align-items-center gap-2">
          <Badge
            bg="success"
            className="dynamic-reference-badge"
            style={{ cursor: sourceGame ? 'pointer' : 'default' }}
            onClick={(e) => {
              e.stopPropagation();
              if (sourceGame) {
                onDynamicReferenceClick(sourceGame.id, game.id, slot);
              }
            }}
            title={sourceGame ? `Click to jump to ${sourceGame.data.standing}` : undefined}
          >
            {sourceGame && <i className="bi bi-link-45deg me-1"></i>}
            {formatTeamReference(dynamicRef)}
          </Badge>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveGameToGameEdge(game.id, slot);
            }}
            title="Remove dynamic reference"
          >
            <i className="bi bi-x"></i>
          </Button>
        </div>
      );
    }

    // Priority 2: Show team/reference selector
    const eligibleGames = getEligibleSourceGames(game);

    return (
      <Form.Select
        size="sm"
        value={teamId || ''}
        onChange={(e) => {
          e.stopPropagation();
          handleTeamChange(game.id, slot, e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ fontSize: '0.875rem' }}
      >
        <option value="">-- Select Team --</option>

        {/* Static teams */}
        {globalTeams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.label}
          </option>
        ))}

        {/* Separator if there are eligible source games */}
        {eligibleGames.length > 0 && <option disabled>---</option>}

        {/* Dynamic references - only show games from earlier stages */}
        {eligibleGames.map((sourceGame) => (
          <React.Fragment key={sourceGame.id}>
            <option value={`winner:${sourceGame.id}`}>
              ⚡ Winner of {sourceGame.data.standing}
            </option>
            <option value={`loser:${sourceGame.id}`}>
              💔 Loser of {sourceGame.data.standing}
            </option>
          </React.Fragment>
        ))}
      </Form.Select>
    );
  };

  return (
    <Table striped bordered hover size="sm">
      <thead>
        <tr>
          <th>Standing</th>
          <th>Home</th>
          <th>Away</th>
          <th>Official</th>
          <th>Break After</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => {
          const isSelected = selectedNodeId === game.id;
          const isHighlighted = highlightedSourceGameId === game.id;

          return (
            <tr
              key={game.id}
              id={`game-${game.id}`}
              onClick={(e) => handleRowClick(e, game.id)}
              className={isHighlighted ? 'source-game-highlighted' : ''}
              style={{
                cursor: 'pointer',
                backgroundColor: isSelected
                  ? '#e7f3ff'
                  : isHighlighted
                  ? '#fff3cd'
                  : undefined,
                boxShadow: isHighlighted ? '0 0 8px rgba(255, 193, 7, 0.6)' : undefined,
                transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
              }}
            >
              <td>{game.data.standing}</td>
              <td>{renderTeamCell(game, 'home')}</td>
              <td>{renderTeamCell(game, 'away')}</td>
              <td className="text-muted small">{getOfficialDisplay(game)}</td>
              <td>{game.data.breakAfter || 0}</td>
              <td>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={(e) => handleDelete(e, game.id)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default GameTable;
