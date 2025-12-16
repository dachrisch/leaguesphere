/**
 * ListDesignerApp Component
 *
 * Main application component for the list-based visual editor
 * for creating flag football tournament schedules.
 *
 * Replaces FlowDesignerApp with a table/list-based UI instead of flowchart.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Container, Row, Col, OverlayTrigger, Popover, ListGroup, Card } from 'react-bootstrap';

import ListCanvas from './ListCanvas';
import FlowToolbar from './FlowToolbar';
import { useFlowState } from '../hooks/useFlowState';
import { useFlowValidation } from '../hooks/useFlowValidation';
import { downloadFlowchartAsJson, validateForExport } from '../utils/flowchartExport';
import { importFromScheduleJson, validateScheduleJson } from '../utils/flowchartImport';
import { scrollToGameWithExpansion } from '../utils/scrollHelpers';
import type { GameNodeData, StageNode, FieldNode, GlobalTeam } from '../types/flowchart';
import { isStageNode, isFieldNode } from '../types/flowchart';

import './ListDesignerApp.css';

/**
 * ListDesignerApp component.
 *
 * Main application layout with:
 * - Toolbar (top)
 * - List canvas (main area)
 * - Properties panel (right sidebar)
 * - Validation footer (bottom)
 */
const ListDesignerApp: React.FC = () => {
  const {
    nodes,
    edges,
    fields,
    globalTeams,
    globalTeamGroups,
    selectedNode,
    addGameNode,
    addFieldNode,
    addStageNode,
    addGameNodeInStage,
    getTargetStage,
    getGameStage,
    getGameField,
    moveNodeToStage,
    updateNode,
    deleteNode,
    addField,
    updateField,
    deleteField,
    setSelection,
    selectNode,
    clearAll,
    importState,
    exportState,
    matchNames,
    groupNames,
    selectedContainerField,
    addGlobalTeam,
    updateGlobalTeam,
    deleteGlobalTeam,
    reorderGlobalTeam,
    addGlobalTeamGroup,
    updateGlobalTeamGroup,
    deleteGlobalTeamGroup,
    reorderGlobalTeamGroup,
    getTeamUsage,
    assignTeamToGame,
    addGameToGameEdge,
    removeGameToGameEdge,
  } = useFlowState();

  // Validate the current flowchart
  const validation = useFlowValidation(nodes, edges);

  // State for highlighting source game when badge is clicked
  const [highlightedSourceGameId, setHighlightedSourceGameId] = useState<string | null>(null);

  // State for controlling expansion of fields and stages
  const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(new Set());
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());

  /**
   * Expand a field container to reveal its contents.
   */
  const expandField = useCallback((fieldId: string) => {
    setExpandedFieldIds((prev) => new Set([...prev, fieldId]));
  }, []);

  /**
   * Expand a stage container to reveal its games.
   */
  const expandStage = useCallback((stageId: string) => {
    setExpandedStageIds((prev) => new Set([...prev, stageId]));
  }, []);

  /**
   * Handle click on a dynamic reference badge in a game table.
   * Scrolls to the source game and highlights it.
   *
   * @param sourceGameId - ID of the source game to scroll to
   * @param targetGameId - ID of the target game (not used, but kept for compatibility)
   * @param targetSlot - Slot on the target game (not used, but kept for compatibility)
   */
  const handleDynamicReferenceClick = useCallback(
    async (sourceGameId: string, targetGameId?: string, targetSlot?: 'home' | 'away') => {
      // Set highlight state
      setHighlightedSourceGameId(sourceGameId);

      // Expand path and scroll to source game
      await scrollToGameWithExpansion(sourceGameId, nodes, expandField, expandStage, true);

      // Auto-clear highlight after 3 seconds
      setTimeout(() => {
        setHighlightedSourceGameId(null);
      }, 3000);
    },
    [nodes, expandField, expandStage]
  );

  /**
   * Handle adding a new global team.
   */
  const handleAddGlobalTeam = useCallback(() => {
    addGlobalTeam();
  }, [addGlobalTeam]);

  /**
   * Handle adding a new global team group.
   */
  const handleAddGlobalTeamGroup = useCallback(() => {
    addGlobalTeamGroup();
  }, [addGlobalTeamGroup]);

  /**
   * Handle adding a new game node.
   * Uses container hierarchy - adds game to target stage.
   */
  const handleAddGame = useCallback(() => {
    // Get target stage (will auto-create hierarchy if needed)
    const targetStage = getTargetStage();
    const stageId = targetStage?.id;

    addGameNodeInStage(stageId);
  }, [addGameNodeInStage, getTargetStage]);

  /**
   * Handle adding a new field container.
   */
  const handleAddFieldContainer = useCallback(() => {
    addFieldNode({}, true); // Include default stage
  }, [addFieldNode]);

  /**
   * Handle adding a new stage container inside selected field.
   */
  const handleAddStage = useCallback(
    (fieldId: string) => {
      addStageNode(fieldId);
    },
    [addStageNode]
  );

  /**
   * Handle import from JSON.
   */
  const handleImport = useCallback(
    (json: unknown) => {
      // Validate JSON format
      const errors = validateScheduleJson(json);
      if (errors.length > 0) {
        alert(`Invalid JSON format:\n${errors.join('\n')}`);
        return;
      }

      // Import the schedule
      const result = importFromScheduleJson(json);

      if (!result.success || !result.state) {
        alert(`Import failed:\n${result.errors.join('\n')}`);
        return;
      }

      // Show warnings if any
      if (result.warnings.length > 0) {
        console.warn('Import warnings:', result.warnings);
      }

      importState(result.state);
    },
    [importState]
  );

  /**
   * Handle export to JSON.
   */
  const handleExport = useCallback(() => {
    const state = exportState();

    // Validate before export
    const errors = validateForExport(state);
    if (errors.length > 0) {
      const proceed = window.confirm(
        `The following issues were found:\n\n${errors.join('\n')}\n\nExport anyway?`
      );
      if (!proceed) return;
    }

    downloadFlowchartAsJson(state);
  }, [exportState]);

  /**
   * Handle clear all.
   */
  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm('Clear all fields, stages, teams, and games?');
    if (confirmed) {
      clearAll();
    }
  }, [clearAll]);

  /**
   * Handle updating node data.
   */
  const handleUpdateNode = useCallback(
    (nodeId: string, data: Partial<GameNodeData>) => {
      updateNode(nodeId, data);
    },
    [updateNode]
  );

  /**
   * Handle updating a global team.
   */
  const handleUpdateGlobalTeam = useCallback(
    (teamId: string, data: Partial<Omit<GlobalTeam, 'id'>>) => {
      updateGlobalTeam(teamId, data);
    },
    [updateGlobalTeam]
  );

  /**
   * Handle deleting a global team.
   */
  const handleDeleteGlobalTeam = useCallback(
    (teamId: string) => {
      deleteGlobalTeam(teamId);
    },
    [deleteGlobalTeam]
  );

  /**
   * Handle reordering a global team.
   */
  const handleReorderGlobalTeam = useCallback(
    (teamId: string, direction: 'up' | 'down') => {
      reorderGlobalTeam(teamId, direction);
    },
    [reorderGlobalTeam]
  );

  /**
   * Handle assigning a team to a game.
   */
  const handleAssignTeam = useCallback(
    (gameId: string, teamId: string, slot: 'home' | 'away') => {
      assignTeamToGame(gameId, teamId, slot);
    },
    [assignTeamToGame]
  );

  /**
   * Handle deleting a node.
   */
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
    },
    [deleteNode]
  );

  /**
   * Handle selecting a node.
   */
  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      selectNode(nodeId);
    },
    [selectNode]
  );

  // Calculate if export is available
  const canExport = useMemo(() => {
    return nodes.some((n) => n.type === 'game') && fields.length > 0;
  }, [nodes, fields]);

  // Check if there are any nodes
  const hasNodes = nodes.length > 0;

  // Get target stage info for toolbar
  const targetStage = useMemo(() => getTargetStage(), [getTargetStage, nodes, selectedNode]);
  const targetStageName = targetStage?.data.name ?? null;

  // Get target field name (from target stage's parent)
  const targetFieldName = useMemo(() => {
    if (!targetStage?.parentId) return null;
    const parentField = nodes.find((n) => n.id === targetStage.parentId && isFieldNode(n)) as
      | FieldNode
      | undefined;
    return parentField?.data.name ?? null;
  }, [targetStage, nodes]);


  return (
    <Container fluid className="list-designer-app">
      <Row className="list-designer-app__header">
        <Col>
          <h1 className="h4 mb-0">Gameday Designer</h1>
          <p className="text-muted small mb-0">List-based editor for tournament schedules</p>
        </Col>
      </Row>

      {/* Toolbar */}
      <Row className="list-designer-app__toolbar">
        <Col>
          <FlowToolbar
            onAddGame={handleAddGame}
            onAddField={handleAddFieldContainer}
            onAddStage={() => {
              if (selectedContainerField) {
                handleAddStage(selectedContainerField.id);
              }
            }}
            onImport={handleImport}
            onExport={handleExport}
            onClearAll={handleClearAll}
            hasNodes={hasNodes}
            canExport={canExport}
            canAddStage={!!selectedContainerField}
            targetStageName={targetStageName}
            targetFieldName={targetFieldName}
            hasSelectedField={!!selectedContainerField}
            showTargetBadge={false} // Don't show target badge in list view
          />
        </Col>
      </Row>

      {/* Main content - wrapped in Card */}
      <Row className="list-designer-app__content">
        <Col className="p-0">
          <Card className="designer-card m-3 shadow-sm" style={{ border: 'none', borderRadius: '8px' }}>
            <Card.Body className="p-0">
              <ListCanvas
                nodes={nodes}
                edges={edges}
                globalTeams={globalTeams}
                globalTeamGroups={globalTeamGroups}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onAddStage={handleAddStage}
                onSelectNode={handleSelectNode}
                selectedNodeId={selectedNode?.id ?? null}
                onAddGlobalTeam={handleAddGlobalTeam}
                onUpdateGlobalTeam={handleUpdateGlobalTeam}
                onDeleteGlobalTeam={handleDeleteGlobalTeam}
                onReorderGlobalTeam={handleReorderGlobalTeam}
                onAddGlobalTeamGroup={handleAddGlobalTeamGroup}
                onUpdateGlobalTeamGroup={updateGlobalTeamGroup}
                onDeleteGlobalTeamGroup={deleteGlobalTeamGroup}
                onReorderGlobalTeamGroup={reorderGlobalTeamGroup}
                getTeamUsage={getTeamUsage}
                onAssignTeam={handleAssignTeam}
                onAddGame={addGameNodeInStage}
                highlightedSourceGameId={highlightedSourceGameId}
                onDynamicReferenceClick={handleDynamicReferenceClick}
                onAddGameToGameEdge={addGameToGameEdge}
                onRemoveGameToGameEdge={removeGameToGameEdge}
                expandedFieldIds={expandedFieldIds}
                expandedStageIds={expandedStageIds}
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Validation summary */}
      <Row className="list-designer-app__footer">
        <Col>
          <div className="d-flex align-items-center gap-3 py-2 px-3 bg-light border-top">
            {validation.isValid && validation.warnings.length === 0 ? (
              <span className="text-success">
                <i className="bi bi-check-circle-fill me-2"></i>
                Valid
              </span>
            ) : (
              <>
                {validation.errors.length > 0 && (
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Popover id="errors-popover">
                        <Popover.Header as="h3">
                          {validation.errors.length} Error{validation.errors.length !== 1 ? 's' : ''}
                        </Popover.Header>
                        <Popover.Body className="p-0">
                          <ListGroup variant="flush">
                            {validation.errors.map((error) => (
                              <ListGroup.Item key={error.id} variant="danger" className="small">
                                {error.message}
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <span className="text-danger" style={{ cursor: 'help' }}>
                      <i className="bi bi-x-circle-fill me-1"></i>
                      {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                    </span>
                  </OverlayTrigger>
                )}
                {validation.warnings.length > 0 && (
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Popover id="warnings-popover">
                        <Popover.Header as="h3">
                          {validation.warnings.length} Warning{validation.warnings.length !== 1 ? 's' : ''}
                        </Popover.Header>
                        <Popover.Body className="p-0">
                          <ListGroup variant="flush">
                            {validation.warnings.map((warning) => (
                              <ListGroup.Item key={warning.id} variant="warning" className="small">
                                {warning.message}
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <span className="text-warning" style={{ cursor: 'help' }}>
                      <i className="bi bi-exclamation-triangle-fill me-1"></i>
                      {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
                    </span>
                  </OverlayTrigger>
                )}
              </>
            )}
            <span className="text-muted small ms-auto">
              {nodes.filter((n) => n.type === 'field').length} fields |{' '}
              {nodes.filter((n) => n.type === 'stage').length} stages |{' '}
              {globalTeams.length} teams |{' '}
              {nodes.filter((n) => n.type === 'game').length} games
            </span>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default ListDesignerApp;
