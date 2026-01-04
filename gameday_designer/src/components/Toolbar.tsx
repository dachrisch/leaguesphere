/**
 * Toolbar Component
 *
 * Provides action buttons for the Gameday Designer:
 * - Add Field: Adds a new playing field to the canvas
 * - Import: Load existing schedule JSON from file
 * - Export: Download current schedule as JSON
 * - Clear All: Reset the entire canvas (with confirmation)
 */

import React, { useRef, useState } from 'react';
import { Button, ButtonGroup, Modal, Alert } from 'react-bootstrap';
import type { ScheduleJson } from '../types/designer';
import { validateScheduleJson } from '../utils/jsonExport';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import LanguageSelector from './LanguageSelector';

export interface ToolbarProps {
  /** Callback when Add Field button is clicked */
  onAddField: () => void;
  /** Callback when valid JSON is imported */
  onImport: (json: ScheduleJson[]) => void;
  /** Callback when Export button is clicked */
  onExport: () => void;
  /** Callback when Clear All is confirmed */
  onClearAll: () => void;
}

/**
 * Toolbar component for the Gameday Designer.
 */
const Toolbar: React.FC<ToolbarProps> = ({
  onAddField,
  onImport,
  onExport,
  onClearAll,
}) => {
  const { t } = useTypedTranslation(['ui', 'modal', 'error']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  /**
   * Handle file selection for import.
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const content = reader.result as string;
        const parsed = JSON.parse(content);

        // Validate the JSON structure
        const validation = validateScheduleJson(parsed);
        if (!validation.valid) {
          setImportError(t('error:invalidScheduleFormat', {
            errors: validation.errors.join(', ')
          }));
          return;
        }

        setImportError(null);
        onImport(parsed as ScheduleJson[]);
      } catch {
        setImportError(t('error:invalidJson'));
      }
    };

    reader.onerror = () => {
      setImportError(t('error:fileReadError'));
    };

    reader.readAsText(file);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Trigger the hidden file input.
   */
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handle Clear All button click.
   */
  const handleClearClick = () => {
    setShowClearConfirm(true);
  };

  /**
   * Confirm the clear all action.
   */
  const handleClearConfirm = () => {
    setShowClearConfirm(false);
    onClearAll();
  };

  /**
   * Cancel the clear all action.
   */
  const handleClearCancel = () => {
    setShowClearConfirm(false);
  };

  /**
   * Dismiss import error alert.
   */
  const handleDismissError = () => {
    setImportError(null);
  };

  return (
    <>
      <div className="toolbar mb-3 d-flex justify-content-between">
        <ButtonGroup>
          <Button variant="primary" onClick={onAddField}>
            <i className="bi bi-plus-lg me-1"></i>
            {t('ui:button.addField')}
          </Button>
          <Button variant="secondary" onClick={handleImportClick}>
            <i className="bi bi-upload me-1"></i>
            {t('ui:button.import')}
          </Button>
          <Button variant="secondary" onClick={onExport}>
            <i className="bi bi-download me-1"></i>
            {t('ui:button.export')}
          </Button>
          <Button variant="danger" onClick={handleClearClick}>
            <i className="bi bi-trash me-1"></i>
            {t('ui:button.clearAll')}
          </Button>
        </ButtonGroup>
        <LanguageSelector />

        {/* Hidden file input for importing */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          data-testid="file-input"
        />
      </div>

      {/* Import error alert */}
      {importError && (
        <Alert variant="danger" dismissible onClose={handleDismissError}>
          {importError}
        </Alert>
      )}

      {/* Clear all confirmation modal */}
      <Modal show={showClearConfirm} onHide={handleClearCancel} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('modal:clearAll.title')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {t('modal:clearAll.message')}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClearCancel}>
            {t('ui:button.cancel')}
          </Button>
          <Button variant="danger" onClick={handleClearConfirm}>
            {t('ui:button.confirm')}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Toolbar;
