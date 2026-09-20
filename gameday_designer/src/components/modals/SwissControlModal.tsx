import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Table, Alert, Spinner } from 'react-bootstrap';
import { designerApi, SwissStandings } from '../../api/designerApi';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';

interface SwissControlModalProps {
  show: boolean;
  onHide: () => void;
  gamedayId: number;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const backend = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (backend) return backend;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const SwissControlModal: React.FC<SwissControlModalProps> = ({ show, onHide, gamedayId }) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  const [standings, setStandings] = useState<SwissStandings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStandings = useCallback(async () => {
    try {
      setStandings(await designerApi.getSwissStandings(gamedayId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('ui:notification.swissRoundFailed')));
    } finally {
      setLoading(false);
    }
  }, [gamedayId, t]);

  useEffect(() => {
    if (!show) {
      return;
    }
    // Fetch on mount/open without synchronous setState in the effect body —
    // the initial loading state covers the first render, and every standings
    // update happens asynchronously from here.
    let active = true;
    designerApi
      .getSwissStandings(gamedayId)
      .then((data) => {
        if (active) {
          setStandings(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(apiErrorMessage(err, t('ui:notification.swissRoundFailed')));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [show, gamedayId, t]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await designerApi.generateSwissRound(gamedayId);
      await fetchStandings();
    } catch (err) {
      setError(apiErrorMessage(err, t('ui:notification.swissRoundFailed')));
    } finally {
      setGenerating(false);
    }
  };

  const nextRound = (standings?.rounds_completed ?? 0) + 1;
  const complete = standings !== null && standings.rounds_completed >= standings.rounds_total;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered data-testid="swiss-control-modal">
      <Modal.Header closeButton>
        <Modal.Title>{t('modal:swissControl.title')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" role="status" data-testid="swiss-standings-loading" />
          </div>
        )}
        {error && (
          <Alert variant="danger" data-testid="swiss-control-error">
            {error}
          </Alert>
        )}
        {!loading && standings && (
          <>
            <h6>{t('modal:swissControl.standingsTitle')}</h6>
            <Table striped bordered hover size="sm" data-testid="swiss-standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('modal:swissControl.teamColumn')}</th>
                  <th>{t('modal:swissControl.playedColumn')}</th>
                  <th>{t('modal:swissControl.winsColumn')}</th>
                  <th>{t('modal:swissControl.drawsColumn')}</th>
                  <th>{t('modal:swissControl.lossesColumn')}</th>
                  <th>{t('modal:swissControl.pointsColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {standings.standings.map((row, index) => (
                  <tr key={row.team_id} data-testid={`swiss-standing-${row.team_id}`}>
                    <td>{index + 1}</td>
                    <td>
                      {row.team_name}
                      {row.byes > 0 && (
                        <span className="badge bg-warning text-dark ms-2">
                          {t('modal:swissControl.byeLabel')}
                        </span>
                      )}
                    </td>
                    <td>{row.played}</td>
                    <td>{row.wins}</td>
                    <td>{row.draws}</td>
                    <td>{row.losses}</td>
                    <td>
                      <strong>{row.points}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {complete ? (
              <Alert variant="success" data-testid="swiss-all-complete">
                {t('modal:swissControl.allRoundsComplete', { count: standings.rounds_total })}
              </Alert>
            ) : (
              <>
                <p className="text-muted small">{t('modal:swissControl.confirmResultsHint')}</p>
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={generating}
                  data-testid="swiss-generate-next"
                >
                  {generating
                    ? t('modal:swissControl.generateNext', { n: nextRound }) + ' …'
                    : t('modal:swissControl.generateNext', { n: nextRound })}
                </Button>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="outline-secondary" onClick={onHide}>
          {t('modal:swissControl.close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SwissControlModal;
