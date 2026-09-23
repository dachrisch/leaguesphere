import React, { useState } from 'react';
import { Modal, Button, ListGroup } from 'react-bootstrap';
import { GlobalTeam } from '../../../types/flowchart';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import { computeSwissRoundTimes } from '../../../utils/swissSchedule';

export interface SwissSetupConfig {
  seedTeamIds: number[];
  rounds: number;
  fields: number;
  gameDuration: number;
}

interface SwissSetupStepProps {
  teams: GlobalTeam[];
  /**
   * Fields + game duration come from the page-1 Configure block
   * (TemplatePreview applyConfig) — this step keeps only seed order +
   * rounds. Out-of-range values fail at confirm with the backend message;
   * no additional client-side validation here.
   */
  fields: number;
  gameDuration: number;
  dayStartTime?: string;
  /** Draft-only: Swiss setup is rejected when published (backend 400). */
  disabled?: boolean;
  onBack: () => void;
  onConfirm: (config: SwissSetupConfig) => void;
}

export const SWISS_MIN_ROUNDS = 2;
export const SWISS_MAX_ROUNDS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SwissSetupStep: React.FC<SwissSetupStepProps> = ({
  teams,
  fields,
  gameDuration,
  dayStartTime = '09:00',
  disabled = false,
  onBack,
  onConfirm,
}) => {
  const { t } = useTypedTranslation(['modal']);
  const [seedIds, setSeedIds] = useState<string[]>(teams.map((team) => team.id));
  const [rounds, setRounds] = useState(4);

  const moveSeed = (index: number, delta: -1 | 1) => {
    setSeedIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const seededTeams = seedIds
    .map((id) => teams.find((team) => team.id === id))
    .filter((team): team is GlobalTeam => team !== undefined);
  const previewTimes = computeSwissRoundTimes(
    seededTeams.length,
    rounds,
    fields,
    gameDuration,
    dayStartTime,
  );

  const handleConfirm = () => {
    onConfirm({
      seedTeamIds: seededTeams.map((team) => parseInt(team.id, 10)),
      rounds,
      fields,
      gameDuration,
    });
  };

  const stepper = (
    label: string,
    value: string,
    onDecrease: () => void,
    onIncrease: () => void,
    testId: string,
  ) => (
    <div className="d-flex align-items-center justify-content-between py-2">
      <span>{label}</span>
      <span className="d-flex align-items-center gap-2">
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={onDecrease}
          data-testid={`${testId}-decrease`}
          aria-label={`${label} decrease`}
        >
          –
        </Button>
        <strong data-testid={testId} style={{ minWidth: 48, textAlign: 'center' }}>
          {value}
        </strong>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={onIncrease}
          data-testid={`${testId}-increase`}
          aria-label={`${label} increase`}
        >
          +
        </Button>
      </span>
    </div>
  );

  return (
    <>
      <Modal.Header>
        <Modal.Title>{t('modal:swissSetup.title')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted">{t('modal:swissSetup.subtitle')}</p>
        <h6>{t('modal:swissSetup.seedTitle')}</h6>
        <p className="text-muted small">{t('modal:swissSetup.seedHint')}</p>
        <ListGroup as="ul" data-testid="swiss-seed-list">
          {seededTeams.map((team, index) => (
            <ListGroup.Item
              as="li"
              key={team.id}
              className="d-flex align-items-center gap-2"
              data-testid={`swiss-seed-${team.id}`}
            >
              <span className="badge bg-primary rounded-pill">{index + 1}</span>
              <span className="flex-grow-1">{team.label}</span>
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={index === 0}
                onClick={() => moveSeed(index, -1)}
                data-testid={`swiss-seed-up-${team.id}`}
                aria-label={`${t('modal:swissSetup.moveUp')} ${team.label}`}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={index === seededTeams.length - 1}
                onClick={() => moveSeed(index, 1)}
                data-testid={`swiss-seed-down-${team.id}`}
                aria-label={`${t('modal:swissSetup.moveDown')} ${team.label}`}
              >
                ↓
              </Button>
            </ListGroup.Item>
          ))}
        </ListGroup>

        <h6 className="mt-4">{t('modal:swissSetup.setupTitle')}</h6>
        {stepper(
          t('modal:swissSetup.rounds'),
          String(rounds),
          () => setRounds((v) => clamp(v - 1, SWISS_MIN_ROUNDS, SWISS_MAX_ROUNDS)),
          () => setRounds((v) => clamp(v + 1, SWISS_MIN_ROUNDS, SWISS_MAX_ROUNDS)),
          'swiss-rounds',
        )}

        <h6 className="mt-4">{t('modal:swissSetup.scheduleTitle')}</h6>
        <p className="text-muted small">{t('modal:swissSetup.scheduleHint')}</p>
        <ListGroup as="ul" data-testid="swiss-schedule-preview">
          {previewTimes.map((startTime, index) => (
            <ListGroup.Item as="li" key={index} className="d-flex justify-content-between">
              <span>{t('modal:swissSetup.roundLabel', { n: index + 1 })}</span>
              <strong>{startTime}</strong>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="outline-secondary" onClick={onBack}>
          {t('modal:swissSetup.back')}
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={seededTeams.length < 2 || disabled}
          data-testid="swiss-setup-confirm"
        >
          {t('modal:swissSetup.confirm')}
        </Button>
      </Modal.Footer>
    </>
  );
};

export default SwissSetupStep;
