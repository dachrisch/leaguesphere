/**
 * FlowToolbar Component
 *
 * Toolbar for the flowchart designer with controls for:
 * - Adding game nodes and containers
 * - Import/Export JSON
 * - Clear all
 * - Undo/Redo (future)
 */

import React, { useRef } from 'react';
import { Button, ButtonGroup, ButtonToolbar } from 'react-bootstrap';

import './FlowToolbar.css';

/**
 * Props for the FlowToolbar component.
 */
export interface FlowToolbarProps {
  /** Callback to add a new game node */
  onAddGame: () => void;
  /** Callback to add a new field container */
  onAddField: () => void;
  /** Callback to add a new stage container (inside selected field) */
  onAddStage: () => void;
  /** Callback to import from JSON file */
  onImport: (json: unknown) => void;
  /** Callback to export to JSON */
  onExport: () => void;
  /** Callback to clear all nodes and edges */
  onClearAll: () => void;
  /** Callback for undo action */
  onUndo?: () => void;
  /** Callback for redo action */
  onRedo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
  /** Whether redo is available */
  canRedo?: boolean;
  /** Whether there are any nodes to clear */
  hasNodes?: boolean;
  /** Whether export is available (has valid data) */
  canExport?: boolean;
  /** Whether a field is selected (to allow adding stage) */
  canAddStage?: boolean;
  /** Name of the target stage where new nodes will be added */
  targetStageName?: string | null;
  /** Name of the target field (derived from stage) */
  targetFieldName?: string | null;
  /** Whether a field is selected (for context) */
  hasSelectedField?: boolean;
  /** Whether to show the target stage badge */
  showTargetBadge?: boolean;
}

/**
 * FlowToolbar component.
 *
 * Provides actions for the flowchart designer.
 */
const FlowToolbar: React.FC<FlowToolbarProps> = ({
  onAddGame,
  onAddField,
  onAddStage,
  onImport,
  onExport,
  onClearAll,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  hasNodes = false,
  canExport = false,
  canAddStage = false,
  targetStageName = null,
  targetFieldName = null,
  hasSelectedField = false,
  showTargetBadge = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Generate tooltip for Add Game button based on target stage.
   */
  const getAddGameTitle = () => {
    if (targetStageName) {
      return `Add Game Node to "${targetStageName}" (Ctrl+G)`;
    }
    if (hasSelectedField && targetFieldName) {
      return `Add Game Node to new stage in "${targetFieldName}" (Ctrl+G)`;
    }
    return 'Add Game Node (will create new Field + Stage) (Ctrl+G)';
  };

  /**
   * Handle file input change for import.
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        onImport(json);
      } catch (error) {
        console.error('Failed to parse JSON file:', error);
        alert('Failed to parse JSON file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again
    event.target.value = '';
  };

  /**
   * Trigger file input click for import.
   */
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handle clear all with confirmation.
   */
  const handleClearAll = () => {
    if (hasNodes) {
      const confirmed = window.confirm(
        'Are you sure you want to clear all nodes and edges? This action cannot be undone.'
      );
      if (confirmed) {
        onClearAll();
      }
    } else {
      onClearAll();
    }
  };

  return (
    <div className="flow-toolbar" data-testid="flow-toolbar">
      <ButtonToolbar>
        {/* Container creation buttons */}
        <ButtonGroup className="me-2">
          <Button
            variant="info"
            onClick={onAddField}
            title="Add Field Container"
            data-testid="add-field-button"
          >
            <i className="bi bi-grid-fill me-1"></i>
            Add Field
          </Button>
          <Button
            variant="secondary"
            onClick={onAddStage}
            disabled={!canAddStage}
            title={
              canAddStage
                ? 'Add Stage Container (inside selected field)'
                : 'Select a field to add a stage'
            }
            data-testid="add-stage-button"
          >
            <i className="bi bi-collection me-1"></i>
            Add Stage
          </Button>
        </ButtonGroup>

        {/* Node creation buttons */}
        <ButtonGroup className="me-2">
          <Button
            variant="primary"
            onClick={onAddGame}
            title={getAddGameTitle()}
            data-testid="add-game-button"
          >
            <i className="bi bi-trophy-fill me-1"></i>
            Add Game
          </Button>
        </ButtonGroup>

        {/* Target stage indicator */}
        {showTargetBadge && (
          <div className="d-flex align-items-center me-2">
            {targetStageName ? (
              <span
                className="badge bg-info text-dark"
                data-testid="target-stage-badge"
              >
                <i className="bi bi-bullseye me-1"></i>
                {targetStageName}
              </span>
            ) : (
              <span
                className="badge bg-warning text-dark"
                data-testid="auto-create-indicator"
              >
                <i className="bi bi-plus-circle me-1"></i>
                Auto-create
              </span>
            )}
          </div>
        )}

        {/* Import/Export buttons */}
        <ButtonGroup className="me-2">
          <Button
            variant="outline-secondary"
            onClick={handleImportClick}
            title="Import from JSON file"
            data-testid="import-button"
          >
            <i className="bi bi-upload me-1"></i>
            Import
          </Button>
          <Button
            variant="outline-secondary"
            onClick={onExport}
            disabled={!canExport}
            title="Export to JSON file"
            data-testid="export-button"
          >
            <i className="bi bi-download me-1"></i>
            Export
          </Button>
        </ButtonGroup>

        {/* Undo/Redo buttons */}
        {(onUndo || onRedo) && (
          <ButtonGroup className="me-2">
            <Button
              variant="outline-secondary"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              data-testid="undo-button"
            >
              <i className="bi bi-arrow-counterclockwise"></i>
            </Button>
            <Button
              variant="outline-secondary"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              data-testid="redo-button"
            >
              <i className="bi bi-arrow-clockwise"></i>
            </Button>
          </ButtonGroup>
        )}

        {/* Clear all button */}
        <ButtonGroup>
          <Button
            variant="outline-danger"
            onClick={handleClearAll}
            disabled={!hasNodes}
            title="Clear all nodes and edges"
            data-testid="clear-all-button"
          >
            <i className="bi bi-trash me-1"></i>
            Clear All
          </Button>
        </ButtonGroup>
      </ButtonToolbar>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        data-testid="import-file-input"
      />
    </div>
  );
};

export default FlowToolbar;
