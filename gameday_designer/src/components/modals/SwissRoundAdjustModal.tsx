import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Table, Spinner } from 'react-bootstrap';
import type {
  SwissRoundPreview,
  SwissGenerateOverrides,
  SwissGeneratePairingOverride,
} from '../../api/designerApi';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';

export interface SwissAdjustTeamOption {
  id: number;
  name: string;
}

interface SwissRoundAdjustModalProps {
  show: boolean;
  onHide: () => void;
  gamedayId: number;
  roundNumber: number;
  preview: SwissRoundPreview;
  teamOptions: SwissAdjustTeamOption[];
  fieldCount: number;
  onConfirm: (overrides: SwissGenerateOverrides) => Promise<void>;
}

interface AdjustRow {
  home: string;
  away: string;
  field: string;
  startTime: string;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const backend = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (backend) return backend;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const SwissRoundAdjustModal: React.FC<SwissRoundAdjustModalProps> = ({
  show,
  onHide,
  gamedayId,
  roundNumber,
  preview,
  teamOptions,
  fieldCount,
  onConfirm,
}) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  // Seeded once per mount from the proposed pairings. The parent remounts
  // the modal (via `key`) every time it opens, so mount-time seeding always
  // reflects the fresh preview without an effect that would wipe edits.
  // Full manual override: every cell is editable and the operator's values
  // are sent verbatim on confirm.
  const [rows, setRows] = useState<AdjustRow[]>(() =>
    preview.pairings.map((pairing) => ({
      home: String(pairing.home_team_id),
      away: String(pairing.away_team_id),
      field: '',
      startTime: '',
    })),
  );
  const [bye, setBye] = useState(
    preview.bye_team_id === null ? '' : String(preview.bye_team_id),
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (index: number, patch: Partial<AdjustRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleConfirm = async () => {
    const overrides: SwissGenerateOverrides = {
      pairings: rows.map((row) => {
        const pairing: SwissGeneratePairingOverride = {
          home_team_id: parseInt(row.home, 10),
          away_team_id: parseInt(row.away, 10),
        };
        if (row.field !== '') {
          pairing.field = parseInt(row.field, 10);
        }
        if (row.startTime !== '') {
          pairing.start_time = row.startTime;
        }
        return pairing;
      }),
      bye_team_id: bye === '' ? null : parseInt(bye, 10),
    };
    setGenerating(true);
    setError(null);
    try {
      await onConfirm(overrides);
    } catch (err) {
      // Parent rethrows so the modal stays open; surface the backend message
      // inline (same extraction as SwissControlModal).
      setError(apiErrorMessage(err, t('ui:notification.swissRoundFailed')));
    } finally {
      setGenerating(false);
    }
  };

  const fieldOptions = Array.from({ length: Math.max(fieldCount, 0) }, (_, i) => i + 1);

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      data-testid="swiss-adjust-modal"
      aria-labelledby="swiss-adjust-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="swiss-adjust-title">
          {t('modal:swissAdjust.title', { n: roundNumber })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">{t('modal:swissAdjust.description')}</p>
        {error && (
          <Alert variant="danger" data-testid="swiss-adjust-error">
            {error}
          </Alert>
        )}
        {rows.length === 0 ? (
          <div className="text-center py-4">
            <Spinner animation="border" role="status" />
          </div>
        ) : (
          <>
            <h6>{t('modal:swissAdjust.pairingsTitle')}</h6>
            <Table striped bordered hover size="sm" data-testid="swiss-adjust-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('modal:swissAdjust.homeLabel')}</th>
                  <th>{t('modal:swissAdjust.awayLabel')}</th>
                  <th>{t('modal:swissAdjust.fieldLabel')}</th>
                  <th>{t('modal:swissAdjust.startTimeLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} data-testid={`swiss-adjust-row-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={row.home}
                        onChange={(e) => updateRow(index, { home: e.target.value })}
                        aria-label={`${t('modal:swissAdjust.homeLabel')} ${index + 1}`}
                        data-testid={`swiss-adjust-home-${index}`}
                      >
                        {teamOptions.map((team) => (
                          <option key={team.id} value={String(team.id)}>
                            {team.name}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={row.away}
                        onChange={(e) => updateRow(index, { away: e.target.value })}
                        aria-label={`${t('modal:swissAdjust.awayLabel')} ${index + 1}`}
                        data-testid={`swiss-adjust-away-${index}`}
                      >
                        {teamOptions.map((team) => (
                          <option key={team.id} value={String(team.id)}>
                            {team.name}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={row.field}
                        onChange={(e) => updateRow(index, { field: e.target.value })}
                        aria-label={`${t('modal:swissAdjust.fieldLabel')} ${index + 1}`}
                        data-testid={`swiss-adjust-field-${index}`}
                      >
                        <option value="">{t('modal:swissAdjust.autoField')}</option>
                        {fieldOptions.map((field) => (
                          <option key={field} value={String(field)}>
                            {field}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <Form.Control
                        type="time"
                        size="sm"
                        value={row.startTime}
                        onChange={(e) => updateRow(index, { startTime: e.target.value })}
                        aria-label={`${t('modal:swissAdjust.startTimeLabel')} ${index + 1}`}
                        data-testid={`swiss-adjust-time-${index}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Form.Group controlId={`swiss-adjust-bye-${gamedayId}`} className="mt-3">
              <Form.Label>{t('modal:swissAdjust.byeLabel')}</Form.Label>
              <Form.Select
                value={bye}
                onChange={(e) => setBye(e.target.value)}
                data-testid="swiss-adjust-bye"
              >
                <option value="">{t('modal:swissAdjust.noBye')}</option>
                {teamOptions.map((team) => (
                  <option key={team.id} value={String(team.id)}>
                    {team.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button
          variant="outline-secondary"
          onClick={onHide}
          disabled={generating}
          data-testid="swiss-adjust-cancel"
        >
          {t('ui:button.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={generating || rows.length === 0}
          data-testid="swiss-adjust-confirm"
        >
          {generating
            ? t('modal:swissAdjust.generating')
            : t('modal:swissAdjust.confirm', { n: roundNumber })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SwissRoundAdjustModal;
