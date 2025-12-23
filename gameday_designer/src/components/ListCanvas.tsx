/**
 * ListCanvas Component
 *
 * Main container for the list-based UI that displays the global team pool
 * and fields with their nested stages/games.
 * Replaces the ReactFlow canvas with a hierarchical list view.
 */

import React from 'react';
import { Container, Card, Button } from 'react-bootstrap';
import GlobalTeamTable from './list/GlobalTeamTable';
import FieldSection from './list/FieldSection';
import type { FlowNode, FlowEdge, FieldNode, StageNode, GlobalTeam, GlobalTeamGroup } from '../types/flowchart';
import { isFieldNode, isStageNode } from '../types/flowchart';
import './ListCanvas.css';

export interface ListCanvasProps {
  /** All nodes in the flowchart */
  nodes: FlowNode[];

  /** All edges in the flowchart */
  edges: FlowEdge[];

  /** Global team pool */
  globalTeams: GlobalTeam[];

  /** Global team groups */
  globalTeamGroups: GlobalTeamGroup[];

  /** Callback when a node is updated */
  onUpdateNode: (nodeId: string, data: any) => void;

  /** Callback when a node is deleted */
  onDeleteNode: (nodeId: string) => void;

  /** Callback when a new field is added */
  onAddField: () => void;

  /** Callback when a new stage is added to a field */
  onAddStage: (fieldId: string) => void;

  /** Callback when a node is selected */
  onSelectNode: (nodeId: string | null) => void;

  /** Currently selected node ID */
  selectedNodeId: string | null;

  /** Callback to add a new global team to a specific group */
  onAddGlobalTeam: (groupId: string) => void;

  /** Callback to update a global team */
  onUpdateGlobalTeam: (teamId: string, data: Partial<Omit<GlobalTeam, 'id'>>) => void;

  /** Callback to delete a global team */
  onDeleteGlobalTeam: (teamId: string) => void;

  /** Callback to reorder a global team */
  onReorderGlobalTeam: (teamId: string, direction: 'up' | 'down') => void;

  /** Callback to add a new global team group */
  onAddGlobalTeamGroup: () => void;

  /** Callback to update a global team group */
  onUpdateGlobalTeamGroup: (groupId: string, data: Partial<Omit<GlobalTeamGroup, 'id'>>) => void;

  /** Callback to delete a global team group */
  onDeleteGlobalTeamGroup: (groupId: string) => void;

  /** Callback to reorder a global team group */
  onReorderGlobalTeamGroup: (groupId: string, direction: 'up' | 'down') => void;

  /** Callback to get team usage information */
  getTeamUsage: (teamId: string) => { gameId: string; slot: 'home' | 'away' }[];

  /** Callback to assign a team to a game */
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;

  /** Callback to add a game to a stage */
  onAddGame: (stageId: string) => void;

  /** Callback to add a GameToGameEdge */
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;

  /** Callback to remove a GameToGameEdge */
  onRemoveGameToGameEdge: (targetGameId: string, targetSlot: 'home' | 'away') => void;

  /** Set of expanded field IDs (controlled) */
  expandedFieldIds: Set<string>;

  /** Set of expanded stage IDs (controlled) */
  expandedStageIds: Set<string>;

  /** Callback to open tournament generator modal */
  onGenerateTournament: () => void;
}

/**
 * ListCanvas component.
 *
 * Renders global team pool at the top, followed by all fields as collapsible sections
 * in a scrollable container. Each field contains nested stages with games.
 */
const ListCanvas: React.FC<ListCanvasProps> = ({
  nodes,
  edges,
  globalTeams,
  globalTeamGroups,
  onUpdateNode,
  onDeleteNode,
  onAddField,
  onAddStage,
  onSelectNode,
  selectedNodeId,
  onAddGlobalTeam,
  onUpdateGlobalTeam,
  onDeleteGlobalTeam,
  onReorderGlobalTeam,
  onAddGlobalTeamGroup,
  onUpdateGlobalTeamGroup,
  onDeleteGlobalTeamGroup,
  onReorderGlobalTeamGroup,
  getTeamUsage,
  onAssignTeam,
  onAddGame,
  onAddGameToGameEdge,
  onRemoveGameToGameEdge,
  expandedFieldIds,
  expandedStageIds,
  onGenerateTournament,
}) => {
  // Filter and sort fields
  const fields = nodes
    .filter((node): node is FieldNode => isFieldNode(node))
    .sort((a, b) => a.data.order - b.data.order);

  // Get stages for a specific field
  const getFieldStages = (fieldId: string): StageNode[] => {
    return nodes
      .filter((node): node is StageNode => isStageNode(node) && node.parentId === fieldId)
      .sort((a, b) => a.data.order - b.data.order);
  };

  return (
    <Container fluid className="list-canvas">
      <div className="list-canvas__content">
        {/* Global Team Pool Section - ALWAYS VISIBLE */}
        <Card className="mb-4 global-team-pool">
          <Card.Header className="d-flex align-items-center">
            <i className="bi bi-people-fill me-2"></i>
            <strong>Global Team Pool</strong>
            <Button
              size="sm"
              variant="success"
              onClick={onGenerateTournament}
              className="ms-2"
            >
              <i className="bi bi-trophy me-1"></i>
              Generate Tournament
            </Button>
            {globalTeamGroups.length > 0 && (
              <Button
                size="sm"
                variant="outline-primary"
                onClick={onAddGlobalTeamGroup}
                className="ms-auto"
              >
                <i className="bi bi-plus-circle me-1"></i>
                Add Group
              </Button>
            )}
          </Card.Header>
          <Card.Body>
            <GlobalTeamTable
              teams={globalTeams}
              groups={globalTeamGroups}
              onAddGroup={onAddGlobalTeamGroup}
              onUpdateGroup={onUpdateGlobalTeamGroup}
              onDeleteGroup={onDeleteGlobalTeamGroup}
              onReorderGroup={onReorderGlobalTeamGroup}
              onAddTeam={onAddGlobalTeam}
              onUpdate={onUpdateGlobalTeam}
              onDelete={onDeleteGlobalTeam}
              onReorder={onReorderGlobalTeam}
              getTeamUsage={getTeamUsage}
              allNodes={nodes}
            />
          </Card.Body>
        </Card>

        {/* Fields Section - Card wrapper with inline Add Field button */}
        <Card className="mb-4 fields-section">
          <Card.Header className="d-flex align-items-center">
            <i className="bi bi-geo-alt-fill me-2"></i>
            <strong>Fields</strong>
            {fields.length > 0 && (
              <Button
                size="sm"
                variant="outline-primary"
                onClick={onAddField}
                className="ms-auto"
              >
                <i className="bi bi-plus-circle me-1"></i>
                Add Field
              </Button>
            )}
          </Card.Header>
          <Card.Body>
            {fields.length === 0 ? (
              <div className="text-center py-5">
                <i className="bi bi-geo-alt" style={{ fontSize: '4rem', opacity: 0.3 }}></i>
                <h3 className="mt-3">No fields yet</h3>
                <p className="text-muted mb-3">Create your first field to organize games</p>
                <Button
                  variant="outline-primary"
                  onClick={onAddField}
                >
                  <i className="bi bi-plus-circle me-1"></i>
                  Add Field
                </Button>
              </div>
            ) : (
              <div className="fields-grid">
                {fields.map((field) => (
                  <FieldSection
                    key={field.id}
                    field={field}
                    stages={getFieldStages(field.id)}
                    allNodes={nodes}
                    edges={edges}
                    globalTeams={globalTeams}
                    onUpdate={onUpdateNode}
                    onDelete={onDeleteNode}
                    onAddStage={onAddStage}
                    onSelectNode={onSelectNode}
                    selectedNodeId={selectedNodeId}
                    onAssignTeam={onAssignTeam}
                    onAddGame={onAddGame}
                    onAddGameToGameEdge={onAddGameToGameEdge}
                    onRemoveGameToGameEdge={onRemoveGameToGameEdge}
                    isExpanded={expandedFieldIds.has(field.id)}
                    expandedStageIds={expandedStageIds}
                  />
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>
    </Container>
  );
};

export default ListCanvas;
