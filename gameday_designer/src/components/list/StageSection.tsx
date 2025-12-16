/**
 * StageSection Component
 *
 * Displays a collapsible stage container with game tables.
 * Part of the list-based UI for the Gameday Designer.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from 'react-bootstrap';
import GameTable from './GameTable';
import type { StageNode, FlowNode, FlowEdge, GameNode, GlobalTeam } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';
import './StageSection.css';

export interface StageSectionProps {
  /** The stage node to display */
  stage: StageNode;

  /** All nodes in the flowchart (for filtering games) */
  allNodes: FlowNode[];

  /** All edges in the flowchart */
  edges: FlowEdge[];

  /** Global team pool */
  globalTeams: GlobalTeam[];

  /** Callback when stage data is updated */
  onUpdate: (nodeId: string, data: Partial<StageNode['data']>) => void;

  /** Callback when stage is deleted */
  onDelete: (nodeId: string) => void;

  /** Callback when a node is selected */
  onSelectNode: (nodeId: string | null) => void;

  /** Currently selected node ID */
  selectedNodeId: string | null;

  /** Callback to assign a team to a game */
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;

  /** Callback to add a game to this stage */
  onAddGame: (stageId: string) => void;

  /** ID of the source game that is currently highlighted */
  highlightedSourceGameId: string | null;

  /** Callback when a dynamic reference badge is clicked */
  onDynamicReferenceClick: (sourceGameId: string, targetGameId: string, targetSlot: 'home' | 'away') => void;

  /** Callback to add a GameToGameEdge */
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;

  /** Callback to remove a GameToGameEdge */
  onRemoveGameToGameEdge: (targetGameId: string, targetSlot: 'home' | 'away') => void;

  /** Whether this stage is expanded (controlled) */
  isExpanded: boolean;
}

/**
 * StageSection component.
 *
 * Renders a stage as a collapsible card with:
 * - Stage name (inline editable)
 * - Stage type badge
 * - Metadata (game count)
 * - Delete Stage button
 * - GameTable for games in this stage
 */
const StageSection: React.FC<StageSectionProps> = ({
  stage,
  allNodes,
  edges,
  globalTeams,
  onUpdate,
  onDelete,
  onSelectNode,
  selectedNodeId,
  onAssignTeam,
  onAddGame,
  highlightedSourceGameId,
  onDynamicReferenceClick,
  onAddGameToGameEdge,
  onRemoveGameToGameEdge,
  isExpanded: isExpandedProp,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(stage.data.name);

  // Use local state but sync with prop when it changes (for programmatic expansion)
  const [localExpanded, setLocalExpanded] = useState(true);
  const isExpanded = isExpandedProp || localExpanded;

  // Sync with prop changes (when expanded programmatically)
  React.useEffect(() => {
    if (isExpandedProp) {
      setLocalExpanded(true);
    }
  }, [isExpandedProp]);

  // Filter games that belong to this stage
  const games = useMemo(
    () =>
      allNodes.filter(
        (node): node is GameNode =>
          isGameNode(node) && node.parentId === stage.id
      ),
    [allNodes, stage.id]
  );

  const isSelected = selectedNodeId === stage.id;

  /**
   * Toggle stage expansion.
   */
  const handleToggleExpand = useCallback(() => {
    setLocalExpanded((prev) => !prev);
  }, []);

  /**
   * Handle Delete Stage button click.
   */
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const confirmed = window.confirm(
        `Delete stage "${stage.data.name}" and all its games?`
      );
      if (confirmed) {
        onDelete(stage.id);
      }
    },
    [stage.id, stage.data.name, onDelete]
  );

  /**
   * Start editing stage name.
   */
  const handleStartEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditingName(true);
      setEditedName(stage.data.name);
    },
    [stage.data.name]
  );

  /**
   * Save edited stage name.
   */
  const handleSaveName = useCallback(() => {
    setIsEditingName(false);
    if (editedName.trim() !== '' && editedName !== stage.data.name) {
      onUpdate(stage.id, { name: editedName.trim() });
    } else {
      setEditedName(stage.data.name);
    }
  }, [editedName, stage.id, stage.data.name, onUpdate]);

  /**
   * Handle name input key press.
   */
  const handleNameKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveName();
      } else if (e.key === 'Escape') {
        setIsEditingName(false);
        setEditedName(stage.data.name);
      }
    },
    [handleSaveName, stage.data.name]
  );

  /**
   * Select this stage.
   */
  const handleSelectStage = useCallback(() => {
    onSelectNode(stage.id);
  }, [stage.id, onSelectNode]);

  /**
   * Handle Add Game button click.
   */
  const handleAddGame = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAddGame(stage.id);
    },
    [stage.id, onAddGame]
  );

  return (
    <Card
      className={`stage-section mb-2 ${isSelected ? 'selected' : ''}`}
      onClick={handleSelectStage}
    >
      <Card.Header
        className="stage-section__header d-flex align-items-center"
        onClick={handleToggleExpand}
        style={{ cursor: 'pointer' }}
      >
        <i
          className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-2`}
        ></i>

        {isEditingName ? (
          <input
            type="text"
            className="form-control form-control-sm me-2"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyPress}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ maxWidth: '200px' }}
          />
        ) : (
          <strong
            className="me-2"
            onDoubleClick={handleStartEdit}
            style={{ cursor: 'text' }}
          >
            {stage.data.name}
          </strong>
        )}

        <Badge bg="primary" className="me-2">
          {stage.data.stageType}
        </Badge>

        <Badge bg="info" className="me-auto">
          {games.length} game{games.length !== 1 ? 's' : ''}
        </Badge>

        <Button
          variant="outline-primary"
          size="sm"
          onClick={handleAddGame}
          className="me-2"
          aria-label="Add Game"
        >
          <i className="bi bi-plus-circle me-1"></i>
          Add Game
        </Button>

        <Button
          variant="outline-danger"
          size="sm"
          onClick={handleDelete}
          aria-label="Delete Stage"
        >
          <i className="bi bi-trash"></i>
        </Button>
      </Card.Header>

      {isExpanded && (
        <Card.Body className="stage-section__body">
          {/* Games Section */}
          <div>
            <h6 className="text-muted">Games</h6>
            <GameTable
              games={games}
              edges={edges}
              allNodes={allNodes}
              globalTeams={globalTeams}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
              onAssignTeam={onAssignTeam}
              highlightedSourceGameId={highlightedSourceGameId}
              onDynamicReferenceClick={onDynamicReferenceClick}
              onAddGameToGameEdge={onAddGameToGameEdge}
              onRemoveGameToGameEdge={onRemoveGameToGameEdge}
            />
          </div>
        </Card.Body>
      )}
    </Card>
  );
};

export default StageSection;
