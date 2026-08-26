/**
 * MigrateConfirmModal Component
 *
 * Final confirmation before a legacy gameday is migrated into the Gameday
 * Designer. Spells out what the migration will (and won't) do, shows a
 * summary of the migration plan (games/fields/groups/teams), and surfaces
 * any server-side plan warnings so the user can decide whether to proceed.
 * Nothing is written until the user confirms.
 */

import React from 'react';
import { Modal, Button, Alert, ListGroup } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import type { MigrationPlan } from '../../types';

interface MigrateConfirmModalProps {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  gamedayName?: string;
  plan: MigrationPlan | null;
}

const MigrateConfirmModal: React.FC<MigrateConfirmModalProps> = ({
  show,
  onHide,
  onConfirm,
  gamedayName,
  plan,
}) => {
  const { t } = useTypedTranslation(['ui']);

  const numGames = plan?.slots.length ?? 0;
  const numFields = plan?.num_fields ?? 0;
  const numGroups = plan?.num_groups ?? 0;
  const numTeams = Object.keys(plan?.team_mapping ?? {}).length;
  const warnings = plan?.warnings ?? [];

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

        {plan && (
          <>
            <Alert variant="info" className="mb-3">
              <Alert.Heading className="h6">
                <i className="bi bi-info-circle-fill me-2"></i>
                {t('ui:migration.confirmSummaryTitle')}
              </Alert.Heading>
              <ListGroup variant="flush" className="bg-transparent">
                <ListGroup.Item className="bg-transparent border-0 py-1 ps-0 small">
                  {t('ui:migration.summaryGames', { count: numGames })}
                </ListGroup.Item>
                <ListGroup.Item className="bg-transparent border-0 py-1 ps-0 small">
                  {t('ui:migration.summaryFields', { count: numFields })}
                </ListGroup.Item>
                <ListGroup.Item className="bg-transparent border-0 py-1 ps-0 small">
                  {t('ui:migration.summaryGroups', { count: numGroups })}
                </ListGroup.Item>
                <ListGroup.Item className="bg-transparent border-0 py-1 ps-0 small">
                  {t('ui:migration.summaryTeams', { count: numTeams })}
                </ListGroup.Item>
              </ListGroup>
            </Alert>

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
          </>
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