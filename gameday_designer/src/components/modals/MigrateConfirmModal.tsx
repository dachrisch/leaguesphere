/**
 * MigrateConfirmModal Component
 *
 * Final confirmation before a legacy gameday is migrated into the Gameday
 * Designer. The migrated canvas is already rendered in the background behind
 * this dialog, so the dialog explains what the migration will (and won't) do
 * and surfaces any plan warnings. Nothing is written until the user confirms.
 */

import React from 'react';
import { Modal, Button, Alert, ListGroup } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';

interface MigrateConfirmModalProps {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  gamedayName?: string;
  warnings: string[];
}

const MigrateConfirmModal: React.FC<MigrateConfirmModalProps> = ({
  show,
  onHide,
  onConfirm,
  gamedayName,
  warnings,
}) => {
  const { t } = useTypedTranslation(['ui']);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fs-5 w-100 text-center">
          <i className="bi bi-arrow-repeat me-2 text-primary"></i>
          {t('ui:migration.confirmTitle')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="pt-2">
        {gamedayName && (
          <p className="text-center text-muted small mb-3">{gamedayName}</p>
        )}
        <p className="mb-3">{t('ui:migration.confirmIntro')}</p>
        <ListGroup variant="flush" className="mb-3">
          <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
            <i className="bi bi-diagram-3 me-2 text-primary"></i>
            {t('ui:migration.confirmPointCanvas')}
          </ListGroup.Item>
          <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
            <i className="bi bi-shield-check me-2 text-success"></i>
            {t('ui:migration.confirmPointUnchanged')}
          </ListGroup.Item>
          <ListGroup.Item className="bg-transparent border-0 px-0 py-1">
            <i className="bi bi-pencil-square me-2 text-info"></i>
            {t('ui:migration.confirmPointEditing')}
          </ListGroup.Item>
        </ListGroup>

        {warnings.length > 0 && (
          <Alert variant="warning" className="mb-0">
            <Alert.Heading className="h6">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {t('ui:migration.confirmWarningsTitle')}
            </Alert.Heading>
            <ListGroup variant="flush" className="bg-transparent">
              {warnings.map((warning) => (
                <ListGroup.Item
                  key={warning}
                  className="bg-transparent border-0 py-1 ps-0 small text-warning-emphasis"
                >
                  <i className="bi bi-dot me-1"></i>
                  {warning}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer className="border-0 d-flex justify-content-center">
        <Button variant="outline-secondary" onClick={onHide}>
          {t('ui:migration.cancelAction')}
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          <i className="bi bi-arrow-repeat me-2"></i>
          {t('ui:migration.confirmAction')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default MigrateConfirmModal;