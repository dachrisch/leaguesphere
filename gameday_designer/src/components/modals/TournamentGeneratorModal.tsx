import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Button, Form, Card, Row, Col, Alert } from 'react-bootstrap';
import { TournamentTemplate, TournamentGenerationConfig } from '../../types/tournament';
import { getAllTemplates } from '../../utils/tournamentTemplates';
import { DEFAULT_START_TIME, DEFAULT_GAME_DURATION } from '../../utils/tournamentConstants';
import { GlobalTeam } from '../../types/flowchart';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import SaveTemplateModal from './SaveTemplateModal';

export interface TournamentGeneratorModalProps {
  /** Whether the modal is visible */
  show: boolean;

  /** Callback when modal should be hidden */
  onHide: () => void;

  /** Global team pool */
  teams: GlobalTeam[];

  /** Whether the current schedule has data that would be cleared */
  hasData?: boolean;

  /** Callback when user confirms tournament generation */
  onGenerate: (config: TournamentGenerationConfig & { 
    generateTeams: boolean; 
    autoAssignTeams: boolean;
    selectedTeamIds?: string[];
  }) => void;

  /** Callback when user wants to save current config as template */
  onSaveAsTemplate?: (name: string, description: string, sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL') => Promise<void>;

  /** Whether the current config is valid for saving */
  isValid?: boolean;
}

/**
 * TournamentGeneratorModal component
 *
 * Features:
 * - Template selection based on team count
 * - Field count configuration
 * - Start time input
 * - Preview of tournament structure
 */
const TournamentGeneratorModal: React.FC<TournamentGeneratorModalProps> = ({
  show,
  onHide,
  teams,
  hasData = false,
  onGenerate,
  onSaveAsTemplate,
  isValid = false,
}) => {
  const { t } = useTypedTranslation(['ui', 'modal', 'domain']);
  // Get all available templates
  const availableTemplates = useMemo(() => getAllTemplates(), []);

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<TournamentTemplate | null>(
    availableTemplates[0] || null
  );

  // Configuration state
  const [fieldCount, setFieldCount] = useState<number>(
    availableTemplates[0]?.fieldOptions[0] || 1
  );
  const [startTime, setStartTime] = useState<string>(DEFAULT_START_TIME);
  const [gameDuration, setGameDuration] = useState<number>(DEFAULT_GAME_DURATION);
  const [breakDuration, setBreakDuration] = useState<number>(10);
  const [generateTeams, setGenerateTeams] = useState<boolean>(false);
  const [autoAssignTeams, setAutoAssignTeams] = useState<boolean>(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const hasTeams = teams.length > 0;

  /**
   * Reset form to default values
   */
  const resetForm = () => {
    setSelectedTemplate(availableTemplates[0] || null);
    setFieldCount(availableTemplates[0]?.fieldOptions[0] || 1);
    setStartTime(DEFAULT_START_TIME);
    setGameDuration(DEFAULT_GAME_DURATION);
    setBreakDuration(10);
    setGenerateTeams(false);
    setAutoAssignTeams(true);
    setSelectedTeamIds([]);
  };
  
    // Reset form when modal is closed
    useEffect(() => {
      if (!show) {
        resetForm();
      }
      // We only want to reset when 'show' changes to false
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    // Auto-select teams when template changes or teams list changes
    useEffect(() => {
      if (!generateTeams && selectedTemplate && teams.length > 0) {
        const teamLimit = selectedTemplate.teamCount.exact || selectedTemplate.teamCount.max;
        setSelectedTeamIds(teams.slice(0, teamLimit).map(t => t.id));
      }
    }, [selectedTemplate, teams, generateTeams]);

  /**
   * Handle tournament generation confirmation
   */
  const handleGenerate = () => {
    if (!selectedTemplate) return;

    onGenerate({
      template: selectedTemplate,
      fieldCount,
      startTime,
      gameDuration,
      breakDuration,
      generateTeams,
      autoAssignTeams,
      selectedTeamIds: generateTeams ? undefined : selectedTeamIds,
    });
    
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered backdrop="static" className="tournament-generator-modal">
      <Modal.Header closeButton className="bg-white border-bottom-0 px-4 pt-4">
        <Modal.Title className="fw-bold d-flex align-items-center">
          <i className="bi bi-grid-3x3-gap-fill text-primary me-3 fs-3"></i>
          {t('ui:title.generateTournament')}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-light p-4">
        {hasData && (
          <Alert variant="warning" className="mb-4 shadow-sm">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-triangle-fill me-3 fs-4"></i>
              <div>
                <strong>{t('ui:message.autoClearTitle')}</strong>
                <br />
                {t('ui:message.autoClearWarning')}
              </div>
            </div>
          </Alert>
        )}

        {onSaveAsTemplate && (
          <div className="d-flex justify-content-between align-items-center mb-4 p-3 bg-white border rounded shadow-sm">
            <div>
              <h6 className="mb-1">{t('ui:title.saveCurrentConfig')}</h6>
              <p className="text-muted small mb-0">{t('ui:message.saveConfigDescription')}</p>
            </div>
            <Button 
              variant="outline-primary" 
              size="sm" 
              onClick={() => setShowSaveModal(true)}
              disabled={!isValid}
            >
              <i className="bi bi-save me-2"></i>
              {t('ui:button.saveAsTemplate')}
            </Button>
          </div>
        )}

        <h5 className="mb-3 d-flex align-items-center">
          <span className="badge bg-primary rounded-pill me-2">1</span>
          {t('ui:title.selectTemplate')}
        </h5>
        
        <Row className="g-3 mb-4">
          {availableTemplates.map((template) => (
            <Col key={template.id} md={6}>
              <Card 
                className={`h-100 cursor-pointer border-2 transition-all ${
                  selectedTemplate?.id === template.id ? 'border-primary bg-primary bg-opacity-10 shadow-sm' : 'border-transparent bg-white'
                }`}
                onClick={() => {
                  setSelectedTemplate(template);
                  setFieldCount(template.fieldOptions[0] || 1);
                }}
              >
                <Card.Body className="p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className={`mb-0 fw-bold ${selectedTemplate?.id === template.id ? 'text-primary' : ''}`}>
                      {template.name}
                    </h6>
                    {selectedTemplate?.id === template.id && (
                      <i className="bi bi-check-circle-fill text-primary fs-5"></i>
                    )}
                  </div>
                  <div className="d-flex gap-2">
                    <span className="badge bg-light text-dark border">
                      <i className="bi bi-people-fill me-1"></i>
                      {template.teamCount.exact || `${template.teamCount.min}-${template.teamCount.max}`} {t('domain:team.teams')}
                    </span>
                    <span className="badge bg-light text-dark border">
                      <i className="bi bi-layers-fill me-1"></i>
                      {template.stages.length} {t('domain:stage.stages')}
                    </span>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {selectedTemplate && (
          <>
            <h5 className="mb-3 d-flex align-items-center">
              <span className="badge bg-primary rounded-pill me-2">2</span>
              {t('ui:title.configureTournament')}
            </h5>
            <Card className="border-0 shadow-sm mb-4">
              <Card.Body className="p-4">
                <Row className="g-4">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.fields')}</Form.Label>
                      <Form.Select 
                        value={fieldCount} 
                        onChange={(e) => setFieldCount(parseInt(e.target.value))}
                        className="form-select-lg"
                      >
                        {selectedTemplate.fieldOptions.map(opt => (
                          <option key={opt} value={opt}>
                            {opt} {opt === 1 ? t('domain:field.field') : t('domain:field.fields')}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.startTime')}</Form.Label>
                      <Form.Control
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="form-control-lg"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.gameDuration')}</Form.Label>
                      <div className="input-group">
                        <Form.Control
                          type="number"
                          value={gameDuration}
                          onChange={(e) => setGameDuration(parseInt(e.target.value))}
                          className="form-control-lg"
                        />
                        <span className="input-group-text">{t('ui:label.minutes')}</span>
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.breakDuration')}</Form.Label>
                      <div className="input-group">
                        <Form.Control
                          type="number"
                          value={breakDuration}
                          onChange={(e) => setBreakDuration(parseInt(e.target.value))}
                          className="form-control-lg"
                        />
                        <span className="input-group-text">{t('ui:label.minutes')}</span>
                      </div>
                    </Form.Group>
                  </Col>
                </Row>

                <hr className="my-4" />

                <h6 className="mb-3 fw-bold">{t('ui:title.teamAssignment')}</h6>
                <div className="bg-light p-3 rounded mb-3">
                  <Form.Check 
                    type="radio"
                    id="assign-existing"
                    name="team-source"
                    label={t('ui:label.useExistingTeams')}
                    checked={!generateTeams}
                    onChange={() => setGenerateTeams(false)}
                    disabled={!hasTeams}
                    className="mb-2 fw-bold"
                  />
                  <Form.Check 
                    type="radio"
                    id="generate-new"
                    name="team-source"
                    label={t('ui:label.generatePlaceholders')}
                    checked={generateTeams}
                    onChange={() => setGenerateTeams(true)}
                    className="fw-bold"
                  />
                </div>

                {!generateTeams && hasTeams && (
                  <div className="mt-3">
                    <Form.Check 
                      type="switch"
                      id="auto-assign"
                      label={t('ui:label.autoAssignTeams')}
                      checked={autoAssignTeams}
                      onChange={(e) => setAutoAssignTeams(e.target.checked)}
                      className="mb-2"
                    />
                    <Form.Text className="text-muted small">
                      {autoAssignTeams 
                        ? t('ui:message.autoAssignNote') 
                        : t('ui:message.manualAssignNote')}
                    </Form.Text>
                  </div>
                )}
              </Card.Body>
            </Card>
          </>
        )}
      </Modal.Body>

      <Modal.Footer className="bg-white border-top-0 px-4 pb-4">
        <Button variant="link" onClick={onHide} className="text-muted text-decoration-none">
          {t('ui:button.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleGenerate}
          disabled={!selectedTemplate}
          className="px-4 py-2 shadow-sm"
          data-testid="confirm-generate-button"
        >
          <i className="bi bi-lightning-fill me-1"></i>
          {t('ui:button.generateTournament')}
        </Button>
      </Modal.Footer>

      <SaveTemplateModal
        show={showSaveModal}
        onHide={() => setShowSaveModal(false)}
        onSave={onSaveAsTemplate || (async () => {})}
      />
    </Modal>
  );
};

export default TournamentGeneratorModal;
