/**
 * SwissStandingsPanel Component
 *
 * Designer-embedded Swiss standings (Task 7): renders the live standings
 * table next to the canvas so table + schedule are visible together. Table,
 * loading, and error patterns are cloned from the retired SwissControlModal;
 * round progression now lives in the per-round Progress buttons (Task 5) and
 * the adjust modal (Task 6), so this panel is read-only.
 */

import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Collapse, Spinner, Table } from 'react-bootstrap';
import { designerApi, SwissStandings } from '../api/designerApi';
import { useTypedTranslation } from '../i18n/useTypedTranslation';

interface SwissStandingsPanelProps {
  gamedayId: number;
  /**
   * Refresh signal: bump to refetch standings without remounting. ListCanvas
   * passes `swiss.completedRounds.length`, which changes on every round
   * generation (and on setup) while gamedayId stays stable.
   */
  refreshKey?: number;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const backend = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (backend) return backend;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const SwissStandingsPanel: React.FC<SwissStandingsPanelProps> = ({ gamedayId, refreshKey = 0 }) => {
  const { t } = useTypedTranslation(['modal', 'ui']);
  const [standings, setStandings] = useState<SwissStandings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let active = true;
    // Re-arm loading/error on every fetch (mount + refreshKey bumps) so a
    // refetch after round generation never flashes the stale table/error.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-status reset on refetch signal
    setLoading(true);
    setError(null);
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
  }, [gamedayId, refreshKey, t]);

  const complete = standings !== null && standings.rounds_completed >= standings.rounds_total;

  return (
    <Card className="shadow-sm mb-3" data-testid="swiss-standings-panel">
      <Card.Header className="d-flex align-items-center bg-white">
        <i className="bi bi-trophy me-2" />
        <strong>{t('modal:swissControl.title')}</strong>
        {standings && (
          <span className="badge bg-secondary ms-2" data-testid="swiss-rounds-indicator">
            {t('modal:swissControl.roundProgress', {
              done: standings.rounds_completed,
              total: standings.rounds_total,
            })}
          </span>
        )}
        <Button
          variant="outline-secondary"
          size="sm"
          className="ms-auto"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="swiss-standings-panel-body"
          aria-label={t('modal:swissControl.toggleStandings')}
          data-testid="swiss-standings-toggle"
        >
          <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} aria-hidden="true" />
        </Button>
      </Card.Header>
      <Collapse in={open} unmountOnExit>
        <div id="swiss-standings-panel-body">
          <Card.Body>
            {loading && (
              <div className="text-center py-4">
                <Spinner animation="border" role="status" data-testid="swiss-standings-loading" />
              </div>
            )}
            {error && (
              <Alert variant="danger" data-testid="swiss-standings-error">
                {error}
              </Alert>
            )}
            {!loading && standings && (
              <>
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

                {complete && (
                  <Alert variant="success" data-testid="swiss-all-complete">
                    {t('modal:swissControl.allRoundsComplete', { count: standings.rounds_total })}
                  </Alert>
                )}
              </>
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
};

export default SwissStandingsPanel;
