/**
 * GameTable Component
 *
 * Displays games in a stage as a table.
 * Shows team assignments via dropdown selectors or dynamic refs from edges.
 * Clicking a row selects the game for editing in the properties panel.
 */

import React from 'react';
import { Table, Form, Badge } from 'react-bootstrap';
import type { GameNode, FlowEdge, FlowNode, GlobalTeam, GameNodeData } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';
import { formatTeamReference } from '../../utils/teamReference';
import { findSourceGameForReference } from '../../utils/edgeAnalysis';
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
  onDynamicReferenceClick: (sourceGameId: string) => void;
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

  const handleTeamAssignment = (e: React.ChangeEvent<HTMLSelectElement>, gameId: string, slot: 'home' | 'away') => {
    e.stopPropagation(); // Prevent row selection
    const teamId = e.target.value;
    if (teamId) {
      onAssignTeam(gameId, teamId, slot);
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

    // Priority 1: Dynamic reference from GameToGameEdge
    if (dynamicRef) {
      // Find the source game for this dynamic reference
      const sourceGame = findSourceGameForReference(game.id, slot, edges, allNodes);

      const handleBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row selection
        if (sourceGame) {
          onDynamicReferenceClick(sourceGame.id);
        }
      };

      return (
        <Badge
          bg="success"
          className="text-truncate dynamic-reference-badge"
          style={{ cursor: sourceGame ? 'pointer' : 'default' }}
          onClick={sourceGame ? handleBadgeClick : undefined}
          title={sourceGame ? `Click to jump to ${sourceGame.data.standing}` : undefined}
        >
          {sourceGame && <i className="bi bi-link-45deg me-1"></i>}
          {formatTeamReference(dynamicRef)}
        </Badge>
      );
    }

    // Priority 2: Manual team assignment via dropdown
    return (
      <Form.Select
        size="sm"
        value={teamId || ''}
        onChange={(e) => handleTeamAssignment(e, game.id, slot)}
        onClick={(e) => e.stopPropagation()}
        style={{ fontSize: '0.875rem' }}
      >
        <option value="">-- Select Team --</option>
        {globalTeams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.label}
          </option>
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
