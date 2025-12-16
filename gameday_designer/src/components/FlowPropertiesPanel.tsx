/**
 * FlowPropertiesPanel Component
 *
 * Side panel for editing properties of the selected node.
 * Shows different UI based on node type (team or game).
 */

import React from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import type {
  FlowNode,
  FlowField,
  GameNodeData,
  FieldNodeData,
  StageNodeData,
  StageType,
  StageNode,
  FieldNode,
} from '../types/flowchart';
import { isGameNode, isFieldNode, isStageNode } from '../types/flowchart';
import type { TeamReference } from '../types/designer';
import TeamSelector from './TeamSelector';

import './FlowPropertiesPanel.css';

/**
 * Node data update type for all node types.
 */
type NodeDataUpdate =
  | Partial<GameNodeData>
  | Partial<FieldNodeData>
  | Partial<StageNodeData>;

/**
 * Props for the FlowPropertiesPanel component.
 */
export interface FlowPropertiesPanelProps {
  /** Currently selected node (null if none) */
  selectedNode: FlowNode | null;
  /** Available fields for assignment */
  fields: FlowField[];
  /** Available match names for winner/loser references */
  matchNames: string[];
  /** Available group names for standing references */
  groupNames: string[];
  /** Callback when node data is updated */
  onUpdateNode: (nodeId: string, data: NodeDataUpdate) => void;
  /** Callback when node is deleted */
  onDeleteNode: (nodeId: string) => void;
  /** Parent stage of the selected node (for teams/games) */
  parentStage?: StageNode | null;
  /** Parent field of the selected node (derived from stage or direct for stages) */
  parentField?: FieldNode | null;
  /** Available stages for moving nodes */
  availableStages?: StageNode[];
  /** Callback when node is moved to a different stage */
  onMoveToStage?: (nodeId: string, stageId: string) => void;
}

/**
 * FlowPropertiesPanel component.
 *
 * Displays and edits properties of the selected node.
 */
const FlowPropertiesPanel: React.FC<FlowPropertiesPanelProps> = ({
  selectedNode,
  fields,
  matchNames,
  groupNames,
  onUpdateNode,
  onDeleteNode,
  parentStage = null,
  parentField = null,
  availableStages = [],
  onMoveToStage,
}) => {
  /**
   * Render parent container info section for games.
   */
  const renderParentContainerInfo = (node: FlowNode) => {
    // Only show for games
    if (!isGameNode(node)) {
      return null;
    }

    // Show warning if no container
    if (!parentStage && !node.parentId) {
      return (
        <Alert variant="warning" className="mb-3" data-testid="no-container-warning">
          <i className="bi bi-exclamation-triangle me-2"></i>
          This node is not inside a container. Move it to a stage.
        </Alert>
      );
    }

    return (
      <div className="mb-3 p-2 bg-light rounded">
        {parentStage && (
          <div className="mb-2">
            <small className="text-muted">Parent Stage</small>
            <div className="fw-medium">{parentStage.data.name}</div>
          </div>
        )}
        {parentField && (
          <div className="mb-2">
            <small className="text-muted">Parent Field</small>
            <div className="fw-medium">{parentField.data.name}</div>
          </div>
        )}
        {availableStages.length > 0 && onMoveToStage && (
          <Form.Group>
            <Form.Label className="small text-muted">Move to Stage</Form.Label>
            <Form.Select
              size="sm"
              value={parentStage?.id ?? ''}
              onChange={(e) => onMoveToStage(node.id, e.target.value)}
              data-testid="move-to-stage-select"
            >
              {availableStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.data.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}
      </div>
    );
  };

  /**
   * Render parent field info for stage nodes.
   */
  const renderStageParentInfo = (node: FlowNode) => {
    if (!isStageNode(node)) return null;

    if (parentField) {
      return (
        <div className="mb-3 p-2 bg-light rounded">
          <div>
            <small className="text-muted">Parent Field</small>
            <div className="fw-medium">{parentField.data.name}</div>
          </div>
        </div>
      );
    }

    return null;
  };

  /**
   * Render properties for a game node.
   */
  const renderGameProperties = (node: FlowNode) => {
    const data = node.data as GameNodeData;

    const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdateNode(node.id, { stage: e.target.value });
    };

    const handleStandingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateNode(node.id, { standing: e.target.value });
    };

    const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const fieldId = e.target.value || null;
      onUpdateNode(node.id, { fieldId });
    };

    const handleOfficialChange = (official: TeamReference | null) => {
      onUpdateNode(node.id, { official });
    };

    const handleBreakAfterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const breakAfter = parseInt(e.target.value, 10) || 0;
      onUpdateNode(node.id, { breakAfter });
    };

    return (
      <>
        <Form.Group className="mb-3">
          <Form.Label>Stage</Form.Label>
          <Form.Select value={data.stage} onChange={handleStageChange}>
            <option value="Vorrunde">Vorrunde</option>
            <option value="Finalrunde">Finalrunde</option>
            <option value="Platzierung">Platzierung</option>
            <option value="Custom">Custom</option>
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Standing / Match ID</Form.Label>
          <Form.Control
            type="text"
            value={data.standing}
            onChange={handleStandingChange}
            placeholder="e.g., HF1, P1, Finale"
            list="standing-suggestions"
          />
          <datalist id="standing-suggestions">
            <option value="HF1" />
            <option value="HF2" />
            <option value="P1" />
            <option value="P3" />
            <option value="Finale" />
            <option value="Spiel 3" />
          </datalist>
        </Form.Group>

        {/* Show field selector only for games not in container hierarchy */}
        {!node.parentId ? (
          <Form.Group className="mb-3">
            <Form.Label>Field</Form.Label>
            <Form.Select
              value={data.fieldId ?? ''}
              onChange={handleFieldChange}
            >
              <option value="">-- No field assigned --</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        ) : (
          <div className="mb-3">
            <Form.Text className="text-muted">
              <i className="bi bi-info-circle me-1"></i>
              Field is derived from container hierarchy
            </Form.Text>
          </div>
        )}

        <Form.Group className="mb-3">
          <Form.Label>Break After (minutes)</Form.Label>
          <Form.Control
            type="number"
            min={0}
            value={data.breakAfter}
            onChange={handleBreakAfterChange}
          />
        </Form.Group>

        <div className="mb-3">
          <Form.Check
            type="checkbox"
            label="Assign Official"
            checked={data.official !== null}
            onChange={(e) => {
              if (e.target.checked) {
                handleOfficialChange({ type: 'static', name: '' });
              } else {
                handleOfficialChange(null);
              }
            }}
          />
        </div>

        {data.official && (
          <TeamSelector
            value={data.official}
            onChange={handleOfficialChange}
            label="Official"
            matchNames={matchNames}
            groupNames={groupNames}
          />
        )}
      </>
    );
  };

  /**
   * Render properties for a field container node.
   */
  const renderFieldProperties = (node: FlowNode) => {
    const data = node.data as FieldNodeData;

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateNode(node.id, { name: e.target.value });
    };

    const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const order = parseInt(e.target.value, 10) || 0;
      onUpdateNode(node.id, { order });
    };

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateNode(node.id, { color: e.target.value });
    };

    return (
      <>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="field-name">Name</Form.Label>
          <Form.Control
            id="field-name"
            type="text"
            value={data.name}
            onChange={handleNameChange}
            placeholder="e.g., Feld 1, Main Field"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label htmlFor="field-order">Order</Form.Label>
          <Form.Control
            id="field-order"
            type="number"
            min={0}
            value={data.order}
            onChange={handleOrderChange}
          />
          <Form.Text className="text-muted">
            Display order for sorting fields
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label htmlFor="field-color">Color</Form.Label>
          <Form.Control
            id="field-color"
            type="color"
            value={data.color ?? '#4CAF50'}
            onChange={handleColorChange}
          />
          <Form.Text className="text-muted">
            Border color for the field container
          </Form.Text>
        </Form.Group>
      </>
    );
  };

  /**
   * Render properties for a stage container node.
   */
  const renderStageProperties = (node: FlowNode) => {
    const data = node.data as StageNodeData;

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateNode(node.id, { name: e.target.value });
    };

    const handleStageTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdateNode(node.id, { stageType: e.target.value as StageType });
    };

    const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const order = parseInt(e.target.value, 10) || 0;
      onUpdateNode(node.id, { order });
    };

    return (
      <>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="stage-name">Name</Form.Label>
          <Form.Control
            id="stage-name"
            type="text"
            value={data.name}
            onChange={handleNameChange}
            placeholder="e.g., Vorrunde, Finalrunde"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label htmlFor="stage-type">Type</Form.Label>
          <Form.Select
            id="stage-type"
            value={data.stageType}
            onChange={handleStageTypeChange}
          >
            <option value="vorrunde">Vorrunde</option>
            <option value="finalrunde">Finalrunde</option>
            <option value="platzierung">Platzierung</option>
            <option value="custom">Custom</option>
          </Form.Select>
          <Form.Text className="text-muted">
            Stage type affects visual styling
          </Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label htmlFor="stage-order">Order</Form.Label>
          <Form.Control
            id="stage-order"
            type="number"
            min={0}
            value={data.order}
            onChange={handleOrderChange}
          />
          <Form.Text className="text-muted">
            Order within the parent field
          </Form.Text>
        </Form.Group>
      </>
    );
  };

  /**
   * Get the node type label for display.
   */
  const getNodeTypeLabel = (node: FlowNode): string => {
    if (isGameNode(node)) return 'Game Node';
    if (isFieldNode(node)) return 'Field Node';
    if (isStageNode(node)) return 'Stage Node';
    return 'Unknown Node';
  };

  /**
   * Get the node type for delete confirmation.
   */
  const getNodeTypeName = (node: FlowNode): string => {
    if (isGameNode(node)) return 'game';
    if (isFieldNode(node)) return 'field';
    if (isStageNode(node)) return 'stage';
    return 'node';
  };

  /**
   * Handle delete button click.
   */
  const handleDelete = () => {
    if (selectedNode) {
      const nodeType = getNodeTypeName(selectedNode);
      const extraWarning =
        nodeType === 'field'
          ? ' This will also delete all stages and games inside.'
          : nodeType === 'stage'
            ? ' This will also delete all games inside.'
            : '';
      const confirmed = window.confirm(
        `Delete this ${nodeType} node? This will also remove all its connections.${extraWarning}`
      );
      if (confirmed) {
        onDeleteNode(selectedNode.id);
      }
    }
  };

  /**
   * Render the appropriate properties based on node type.
   */
  const renderNodeProperties = (node: FlowNode) => {
    if (isFieldNode(node)) return renderFieldProperties(node);
    if (isStageNode(node)) return renderStageProperties(node);
    if (isGameNode(node)) return renderGameProperties(node);
    return null;
  };

  return (
    <Card className="flow-properties-panel" data-testid="flow-properties-panel">
      <Card.Header>
        <i className="bi bi-gear-fill me-2"></i>
        Properties
      </Card.Header>
      <Card.Body>
        {!selectedNode ? (
          <Alert variant="info" className="mb-0">
            <i className="bi bi-info-circle me-2"></i>
            Select a node to edit its properties
          </Alert>
        ) : (
          <Form>
            <div className="mb-3">
              <span className="badge bg-secondary me-2">
                {getNodeTypeLabel(selectedNode)}
              </span>
              <span className="text-muted small">ID: {selectedNode.id}</span>
            </div>

            {/* Show parent container info for games */}
            {renderParentContainerInfo(selectedNode)}

            {/* Show parent field info for stages */}
            {renderStageParentInfo(selectedNode)}

            {renderNodeProperties(selectedNode)}

            <hr />

            <Button
              variant="outline-danger"
              size="sm"
              onClick={handleDelete}
              className="w-100"
              data-testid="delete-node-button"
            >
              <i className="bi bi-trash me-2"></i>
              Delete Node
            </Button>
          </Form>
        )}
      </Card.Body>
    </Card>
  );
};

export default FlowPropertiesPanel;
