/**
 * FlowToolbar Component
 *
 * Toolbar for the flowchart designer with controls for:
 * - Import/Export JSON
 * - Undo/Redo
 *
 * Gameday-level actions (Publish, Clear, Delete) have been moved 
 * to the GamedayMetadataAccordion component.
 */

import React, { useRef } from 'react';
import { Button, ButtonGroup, ButtonToolbar, Dropdown, Form } from 'react-bootstrap';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import { ICONS } from '../utils/iconConstants';

import './FlowToolbar.css';

/**
 * Props for the FlowToolbar component.
 */
export interface FlowToolbarProps {
  /** Callback to import from JSON file */
  onImport: (json: unknown) => void;
  /** Callback to export to JSON */
  onExport: () => void;
  /** Current gameday status */
  gamedayStatus?: string;
  /** Callback for notifications */
  onNotify?: (message: string, type: import('../types/designer').NotificationType, title?: string) => void;
  /** Callback for undo action */
  onUndo?: () => void;
  /** Callback for redo action */
  onRedo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
  /** Whether redo is available */
  canRedo?: boolean;
  /** Whether export is available (has valid data) */
  canExport?: boolean;
  /**
   * @deprecated Results-mode entry was removed from the designer — results are
   * entered via the scorecard. Kept for backward compatibility with callers
   * that still pass these props; they are no longer rendered.
   */
  onResultsMode?: () => void;
  /** @deprecated See {@link onResultsMode}. */
  resultsMode?: boolean;
  /**
   * Expert Mode: per-user, local-only toggle that reveals the Progression
   * Inspector (simulated bracket outcome + non-blocking correctness
   * findings). Off by default — see `useExpertMode.ts`.
   */
  expertMode?: boolean;
  /** Callback to toggle Expert Mode on/off. */
  onToggleExpertMode?: (value: boolean) => void;
}

/**
 * FlowToolbar component.
 *
 * Provides global actions for the flowchart designer.
 */
const FlowToolbar: React.FC<FlowToolbarProps> = ({
  onImport,
  onExport,
  gamedayStatus = 'DRAFT',
  onNotify,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  canExport = false,
  expertMode = false,
  onToggleExpertMode,
}) => {
  const { t } = useTypedTranslation(['ui']);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        onNotify?.(t('error:invalidJson'), 'danger', t('ui:notification.title.importError'));
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

  return (
    <div className="flow-toolbar" data-testid="flow-toolbar">
      <ButtonToolbar>
        {/* Import/Export buttons */}
        <ButtonGroup className="me-2">
          <Button
            variant="outline-secondary"
            onClick={handleImportClick}
            title={t('ui:tooltip.importFromJson')}
            data-testid="import-button"
            disabled={gamedayStatus !== 'DRAFT'}
          >
            <i className={`bi ${ICONS.IMPORT}`}></i>
          </Button>
          <Dropdown as={ButtonGroup}>
            <Button
              variant="outline-secondary"
              onClick={onExport}
              disabled={!canExport}
              title={t('ui:tooltip.exportToJson')}
              data-testid="export-button"
            >
              <i className={`bi ${ICONS.EXPORT}`}></i>
            </Button>

            <Dropdown.Toggle 
              split 
              variant="outline-secondary" 
              id="export-dropdown" 
              disabled={!canExport} 
              data-testid="export-dropdown-toggle"
            />

            <Dropdown.Menu>
              <Dropdown.Item onClick={onExport}>
                <i className={`bi ${ICONS.EXPORT} me-2`}></i>
                {t('ui:button.exportSchedule')}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </ButtonGroup>

        {/* Undo/Redo buttons */}
        {(onUndo || onRedo) && (
          <ButtonGroup className="me-2">
            <Button
              variant="outline-secondary"
              onClick={onUndo}
              disabled={!canUndo || gamedayStatus !== 'DRAFT'}
              title={t('ui:tooltip.undo')}
              data-testid="undo-button"
            >
              <i className={`bi ${ICONS.UNDO}`}></i>
            </Button>
            <Button
              variant="outline-secondary"
              onClick={onRedo}
              disabled={!canRedo || gamedayStatus !== 'DRAFT'}
              title={t('ui:tooltip.redo')}
              data-testid="redo-button"
            >
              <i className="bi bi-arrow-clockwise"></i>
            </Button>
          </ButtonGroup>
        )}

        {/* Expert Mode toggle — per-user, local-only; reveals the Progression Inspector */}
        {onToggleExpertMode && (
          <>
            <Form.Check
              type="switch"
              id="expert-mode-toggle"
              className="flow-toolbar-expert-mode d-flex align-items-center"
              // `title` on <Form.Check> only ever reaches the <label> (react-bootstrap
              // renders it there, not on the wrapping <div> or the <input>) — fine as a
              // native hover tooltip for sighted mouse users, but not something screen
              // readers reliably treat as the control's description. The actual <input>
              // gets its description via `aria-describedby` below instead (an unlisted
              // prop here, so react-bootstrap forwards it straight onto the input).
              title={t('ui:tooltip.expertMode')}
              label={
                <span>
                  <i className={`bi ${ICONS.EXPERT_MODE} me-1`}></i>
                  {t('ui:label.expertMode')}
                </span>
              }
              checked={expertMode}
              onChange={(e) => onToggleExpertMode(e.target.checked)}
              aria-describedby="expert-mode-toggle-description"
              data-testid="expert-mode-toggle"
            />
            <span id="expert-mode-toggle-description" className="visually-hidden">
              {t('ui:tooltip.expertMode')}
            </span>
          </>
        )}
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