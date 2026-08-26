/**
 * MigrateConfirmModal Component
 *
 * Final confirmation before a legacy gameday is migrated into the Gameday
 * Designer. The migrated canvas is already rendered in the background behind
 * this dialog, so the dialog only needs to state what the migration will (and
 * won't) do and surface any plan warnings. Nothing is written until the user
 * confirms.
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
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">
          <i className="bi bi-arrow-repeat me-2"></i>
          {t('ui:migration.confirmTitle')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">{t('ui:migration.confirmDescription', { name: gamedayName ?? '' })}</p>

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
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {t('ui:button.cancel')}
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