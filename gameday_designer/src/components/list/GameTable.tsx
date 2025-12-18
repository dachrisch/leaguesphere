/**
 * GameTable Component
 *
 * Displays games in a stage as a table.
 * Shows team assignments via dropdown selectors or dynamic refs from edges.
 * Features inline editing for standing and breakAfter fields.
 */

import React, { useState, useCallback } from 'react';
import { Table, Form } from 'react-bootstrap';
import type { GameNode, FlowEdge, FlowNode, GlobalTeam, GameNodeData } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';
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
  onUpdate,
  onAddGameToGameEdge,
  onRemoveGameToGameEdge,
}) => {
  // State for inline editing
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'standing' | 'breakAfter' | null>(null);
  const [editedValue, setEditedValue] = useState<string>('');

  const handleRowClick = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent bubbling to parent containers
    onSelectNode(gameId);
  };

  const handleDelete = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent row selection
    onDelete(gameId);
  };

  /**
   * Start editing a field.
   */
  const handleStartEdit = useCallback(
    (e: React.MouseEvent, game: GameNode, field: 'standing' | 'breakAfter') => {
      e.stopPropagation();
      setEditingGameId(game.id);
      setEditingField(field);
      setEditedValue(
        field === 'standing' ? game.data.standing : String(game.data.breakAfter || 0)
      );
    },
    []
  );

  /**
   * Save edited value.
   */
  const handleSaveEdit = useCallback(
    (gameId: string, field: 'standing' | 'breakAfter') => {
      if (editedValue.trim() !== '') {
        if (field === 'standing') {
          onUpdate(gameId, { standing: editedValue.trim() });
        } else {
          const numValue = parseInt(editedValue, 10);
          if (!isNaN(numValue) && numValue >= 0) {
            onUpdate(gameId, { breakAfter: numValue });
          }
        }
      }
      setEditingGameId(null);
      setEditingField(null);
    },
    [editedValue, onUpdate]
  );

  /**
   * Cancel editing.
   */
  const handleCancelEdit = useCallback(() => {
    setEditingGameId(null);
    setEditingField(null);
  }, []);

  /**
   * Handle key press during editing.
   */
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, gameId: string, field: 'standing' | 'breakAfter') => {
      if (e.key === 'Enter') {
        handleSaveEdit(gameId, field);
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

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

  /**
   * Handle official selection change.
   */
  const handleOfficialChange = useCallback(
    (gameId: string, value: string) => {
      if (!value) {
        // Clear official
        onUpdate(gameId, { official: undefined });
        return;
      }

      // Update official with the selected value (static team or dynamic reference)
      onUpdate(gameId, { official: value });
    },
    [onUpdate]
  );

  /**
   * Render official selector (checkbox + dropdown).
   */
  const renderOfficialCell = (game: GameNode) => {
    const official = game.data.official;
    const hasOfficial = !!official;
    const eligibleGames = getEligibleSourceGames(game);

    return (
      <div className="d-flex align-items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Checkbox to enable/disable official */}
        <Form.Check
          type="checkbox"
          checked={hasOfficial}
          onChange={(e) => {
            if (!e.target.checked) {
              // Disable official
              handleOfficialChange(game.id, '');
            } else {
              // Enable with first team if available
              if (globalTeams.length > 0) {
                handleOfficialChange(game.id, globalTeams[0].id);
              }
            }
          }}
          style={{ margin: 0 }}
        />

        {/* Dropdown selector (only shown when enabled) */}
        {hasOfficial && (
          <Form.Select
            size="sm"
            value={official}
            onChange={(e) => handleOfficialChange(game.id, e.target.value)}
            style={{ fontSize: '0.875rem', minWidth: '150px' }}
          >
            {/* Static teams */}
            {globalTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.label}
              </option>
            ))}

            {/* Separator if there are eligible source games */}
            {eligibleGames.length > 0 && <option disabled>---</option>}

            {/* Dynamic references - only show games from earlier stages */}
            {eligibleGames.map((sourceGame) => {
              const sourcePath = getGamePath(sourceGame.id, allNodes);
              const stageName = sourcePath?.stage.data.name || '';
              return (
                <React.Fragment key={sourceGame.id}>
                  <option value={`winner:${sourceGame.id}`}>
                    ⚡ Winner of [{stageName}] - {sourceGame.data.standing}
                  </option>
                  <option value={`loser:${sourceGame.id}`}>
                    💔 Loser of [{stageName}] - {sourceGame.data.standing}
                  </option>
                </React.Fragment>
              );
            })}
          </Form.Select>
        )}
      </div>
    );
  };

  // Render team cell as a simple dropdown (like officials)
  const renderTeamCell = (game: GameNode, slot: 'home' | 'away') => {
    const data = game.data as GameNodeData;
    const dynamicRef = slot === 'home' ? data.homeTeamDynamic : data.awayTeamDynamic;
    const teamId = slot === 'home' ? data.homeTeamId : data.awayTeamId;
    const eligibleGames = getEligibleSourceGames(game);

    // Determine current value
    let currentValue = '';
    if (dynamicRef) {
      // Find the source game to get the output type
      const sourceGame = findSourceGameForReference(game.id, slot, edges, allNodes);
      if (sourceGame) {
        // Extract output type from dynamicRef
        const outputType = dynamicRef.outputType || 'winner';
        currentValue = `${outputType}:${sourceGame.id}`;
      }
    } else if (teamId) {
      currentValue = teamId;
    }

    return (
      <Form.Select
        size="sm"
        value={currentValue}
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
        {eligibleGames.map((sourceGame) => {
          const sourcePath = getGamePath(sourceGame.id, allNodes);
          const stageName = sourcePath?.stage.data.name || '';
          return (
            <React.Fragment key={sourceGame.id}>
              <option value={`winner:${sourceGame.id}`}>
                ⚡ Winner of [{stageName}] - {sourceGame.data.standing}
              </option>
              <option value={`loser:${sourceGame.id}`}>
                💔 Loser of [{stageName}] - {sourceGame.data.standing}
              </option>
            </React.Fragment>
          );
        })}
      </Form.Select>
    );
  };

  if (games.length === 0) {
    return (
      <div className="text-muted text-center py-2">
        <i className="bi bi-trophy me-2"></i>
        No games in this stage.
      </div>
    );
  }

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
          const isEditingStanding = editingGameId === game.id && editingField === 'standing';
          const isEditingBreakAfter = editingGameId === game.id && editingField === 'breakAfter';

          return (
            <tr
              key={game.id}
              id={`game-${game.id}`}
              onClick={(e) => handleRowClick(e, game.id)}
              style={{
                cursor: 'pointer',
                backgroundColor: isSelected ? '#e7f3ff' : undefined,
              }}
            >
              {/* Standing column - inline editable */}
              <td onClick={(e) => e.stopPropagation()}>
                {isEditingStanding ? (
                  <Form.Control
                    type="text"
                    size="sm"
                    value={editedValue}
                    onChange={(e) => setEditedValue(e.target.value)}
                    onBlur={() => handleSaveEdit(game.id, 'standing')}
                    onKeyDown={(e) => handleKeyPress(e, game.id, 'standing')}
                    autoFocus
                    style={{ fontSize: '0.875rem' }}
                  />
                ) : (
                  <span
                    onClick={(e) => handleStartEdit(e, game, 'standing')}
                    style={{ cursor: 'text' }}
                    title="Click to edit"
                  >
                    {game.data.standing}
                  </span>
                )}
              </td>

              {/* Home team column */}
              <td>{renderTeamCell(game, 'home')}</td>

              {/* Away team column */}
              <td>{renderTeamCell(game, 'away')}</td>

              {/* Official column */}
              <td>{renderOfficialCell(game)}</td>

              {/* Break After column - inline editable */}
              <td onClick={(e) => e.stopPropagation()}>
                {isEditingBreakAfter ? (
                  <Form.Control
                    type="number"
                    size="sm"
                    value={editedValue}
                    onChange={(e) => setEditedValue(e.target.value)}
                    onBlur={() => handleSaveEdit(game.id, 'breakAfter')}
                    onKeyDown={(e) => handleKeyPress(e, game.id, 'breakAfter')}
                    autoFocus
                    min="0"
                    style={{ fontSize: '0.875rem', width: '80px' }}
                  />
                ) : (
                  <span
                    onClick={(e) => handleStartEdit(e, game, 'breakAfter')}
                    style={{ cursor: 'text' }}
                    title="Click to edit"
                  >
                    {game.data.breakAfter || 0}
                  </span>
                )}
              </td>

              {/* Actions column */}
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
