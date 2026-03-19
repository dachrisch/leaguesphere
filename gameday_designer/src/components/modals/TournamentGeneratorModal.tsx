import React, { useState, useMemo, useEffect } from 'react';
import { Modal, Button, Form, Card, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { TournamentTemplate, TournamentGenerationConfig } from '../../types/tournament';
import { getAllTemplates } from '../../utils/tournamentTemplates';
import { DEFAULT_START_TIME, DEFAULT_GAME_DURATION } from '../../utils/tournamentConstants';
import { GlobalTeam } from '../../types/flowchart';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import SaveTemplateModal from './SaveTemplateModal';
import { gamedayApi } from '../../api/gamedayApi';
import { GenericTemplate } from '../../utils/templateMapper';

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
    customTemplate?: GenericTemplate;
  }) => void;

  /** Callback when user wants to save current config as template */
  onSaveAsTemplate?: (name: string, description: string, sharing: 'PRIVATE' | 'ASSOCIATION' | 'GLOBAL') => Promise<void>;

  /** Whether the current config is valid for saving */
  isValid?: boolean;
}

/**
 * TournamentGeneratorModal component
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
  
  const [customTemplates, setCustomTemplates] = useState<GenericTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Get all available templates
  const builtInTemplates = useMemo(() => getAllTemplates(), []);

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<TournamentTemplate | null>(
    builtInTemplates[0] || null
  );
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<GenericTemplate | null>(null);

  // Configuration state
  const [fieldCount, setFieldCount] = useState<number>(1);
  const [startTime, setStartTime] = useState<string>(DEFAULT_START_TIME);
  const [gameDuration, setGameDuration] = useState<number>(DEFAULT_GAME_DURATION);
  const [breakDuration, setBreakDuration] = useState<number>(10);
  const [generateTeams, setGenerateTeams] = useState<boolean>(false);
  const [autoAssignTeams, setAutoAssignTeams] = useState<boolean>(true);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    if (show) {
      setIsLoadingTemplates(true);
      gamedayApi.getTemplates()
        .then(templates => setCustomTemplates(templates))
        .catch(err => console.error('Failed to fetch custom templates', err))
        .finally(() => setIsLoadingTemplates(false));
    }
  }, [show]);

  const hasTeams = teams.length > 0;

  /**
   * Reset form to default values
   */
  const resetForm = () => {
    setSelectedTemplate(builtInTemplates[0] || null);
    setSelectedCustomTemplate(null);
    setFieldCount(builtInTemplates[0]?.fieldOptions[0] || 1);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show]);

    // Auto-select teams when template changes or teams list changes
    useEffect(() => {
      if (!generateTeams && teams.length > 0) {
        let teamLimit = 0;
        if (selectedTemplate) {
            teamLimit = selectedTemplate.teamCount.exact || selectedTemplate.teamCount.min;
        } else if (selectedCustomTemplate) {
            teamLimit = selectedCustomTemplate.num_teams;
        }
        
        if (teamLimit > 0 && selectedTeamIds.length === 0) {
            setSelectedTeamIds(teams.slice(0, teamLimit).map(t => t.id));
        }
      }
    }, [selectedTemplate, selectedCustomTemplate, teams, generateTeams, selectedTeamIds.length]);

    // Validation
    const isDurationValid = gameDuration >= 15 && gameDuration <= 180;
    const isTeamCountValid = useMemo(() => {
      if (!selectedTemplate && !selectedCustomTemplate) return false;
      if (generateTeams) return true;
      const required = selectedTemplate 
        ? (selectedTemplate.teamCount.exact || selectedTemplate.teamCount.min)
        : (selectedCustomTemplate?.num_teams || 0);
      return selectedTeamIds.length === required;
    }, [selectedTemplate, selectedCustomTemplate, generateTeams, selectedTeamIds.length]);
  
    const canGenerate = (selectedTemplate || selectedCustomTemplate) && isDurationValid && isTeamCountValid;

    console.log('Validation Debug:', {
        gameDuration,
        isDurationValid,
        selectedTeamIdsCount: selectedTeamIds.length,
        isTeamCountValid,
        canGenerate,
        selectedTemplate: selectedTemplate?.name,
        generateTeams
    });

  /**
   * Handle tournament generation confirmation
   */
  const handleGenerate = () => {
    if (!canGenerate) return;

    if (selectedTemplate) {
        onGenerate({
          template: {
            ...selectedTemplate,
            timing: {
                ...selectedTemplate.timing,
                defaultGameDuration: gameDuration,
                defaultBreakBetweenGames: breakDuration
            }
          },
          fieldCount,
          startTime,
          gameDuration,
          breakDuration,
          generateTeams,
          autoAssignTeams,
          selectedTeamIds: generateTeams ? undefined : selectedTeamIds,
        });
    } else if (selectedCustomTemplate) {
        onGenerate({
            template: {
                id: String(selectedCustomTemplate.id),
                name: selectedCustomTemplate.name,
                teamCount: { min: selectedCustomTemplate.num_teams, max: selectedCustomTemplate.num_teams, exact: selectedCustomTemplate.num_teams },
                fieldOptions: [selectedCustomTemplate.num_fields],
                stages: [],
                timing: {
                    firstGameStartTime: startTime,
                    defaultGameDuration: gameDuration,
                    defaultBreakBetweenGames: breakDuration
                }
            },
            fieldCount: selectedCustomTemplate.num_fields,
            startTime,
            gameDuration,
            breakDuration,
            generateTeams,
            autoAssignTeams,
            selectedTeamIds: generateTeams ? undefined : selectedTeamIds,
            customTemplate: selectedCustomTemplate
        });
    }
    
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
          <Alert variant="warning" className="mb-4 shadow-sm border-2">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-triangle-fill fs-4 me-3"></i>
              <div>
                <h5 className="mb-1 fw-bold">{t('modal:tournamentGenerator.warningTitle', 'Auto-Clear Warning')}</h5>
                <p className="mb-0">{t('modal:tournamentGenerator.warningMessage') || t('ui:message.autoClearWarning')}</p>
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
          <Col xs={12}><small className="text-muted text-uppercase fw-bold">{t('ui:label.builtInTemplates')}</small></Col>
          {builtInTemplates.map((template) => (
            <Col key={template.id} md={6}>
              <Card 
                className={`h-100 cursor-pointer border-2 transition-all ${
                  selectedTemplate?.id === template.id ? 'border-primary bg-primary bg-opacity-10 shadow-sm' : 'border-transparent bg-white'
                }`}
                onClick={() => {
                  setSelectedTemplate(template);
                  setSelectedCustomTemplate(null);
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

          {customTemplates.length > 0 && (
            <>
              <Col xs={12} className="mt-4"><small className="text-muted text-uppercase fw-bold">{t('ui:label.customTemplates')}</small></Col>
              {customTemplates.map((template) => (
                <Col key={template.id} md={6}>
                  <Card 
                    className={`h-100 cursor-pointer border-2 transition-all ${
                      selectedCustomTemplate?.id === template.id ? 'border-primary bg-primary bg-opacity-10 shadow-sm' : 'border-transparent bg-white'
                    }`}
                    onClick={() => {
                      setSelectedCustomTemplate(template);
                      setSelectedTemplate(null);
                      setFieldCount(template.num_fields);
                    }}
                  >
                    <Card.Body className="p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className={`mb-0 fw-bold ${selectedCustomTemplate?.id === template.id ? 'text-primary' : ''}`}>
                          {template.name}
                        </h6>
                        {selectedCustomTemplate?.id === template.id && (
                          <i className="bi bi-check-circle-fill text-primary fs-5"></i>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <span className="badge bg-light text-dark border">
                          <i className="bi bi-people-fill me-1"></i>
                          {template.num_teams} {t('domain:team.teams')}
                        </span>
                        <span className="badge bg-light text-dark border">
                          <i className="bi bi-grid-3x3-gap-fill me-1"></i>
                          {template.num_fields} {t('domain:field.fields')}
                        </span>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </>
          )}
          {isLoadingTemplates && <Col xs={12} className="text-center p-3"><Spinner animation="border" variant="primary" size="sm" /></Col>}
        </Row>

        {(selectedTemplate || selectedCustomTemplate) && (
          <>
            <h5 className="mb-3 d-flex align-items-center">
              <span className="badge bg-primary rounded-pill me-2">2</span>
              {t('ui:title.configureTournament')}
            </h5>
            <Card className="border-0 shadow-sm mb-4">
              <Card.Body className="p-4">
                <Row className="g-4">
                  <Col md={6}>
                    <Form.Group controlId="tournament-fields">
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.fields')}</Form.Label>
                      <Form.Select 
                        value={fieldCount} 
                        onChange={(e) => setFieldCount(parseInt(e.target.value))}
                        className="form-select-lg"
                        disabled={!!selectedCustomTemplate}
                      >
                        {selectedTemplate?.fieldOptions.map(opt => (
                          <option key={opt} value={opt}>
                            {opt} {opt === 1 ? t('domain:field.field') : t('domain:field.fields')}
                          </option>
                        ))}
                        {selectedCustomTemplate && (
                            <option value={selectedCustomTemplate.num_fields}>{selectedCustomTemplate.num_fields} {selectedCustomTemplate.num_fields === 1 ? t('domain:field.field') : t('domain:field.fields')}</option>
                        )}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="tournament-start-time">
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
                    <Form.Group controlId="tournament-game-duration">
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.gameDuration')}</Form.Label>
                      <div className="input-group">
                        <Form.Control
                          type="number"
                          value={gameDuration}
                          onChange={(e) => setGameDuration(parseInt(e.target.value) || 0)}
                          className={`form-control-lg ${!isDurationValid ? 'is-invalid' : ''}`}
                        />
                        <span className="input-group-text">{t('ui:label.minutes')}</span>
                        {!isDurationValid && (
                            <Form.Control.Feedback type="invalid">
                                {t('modal:tournamentGenerator.durationValidation')}
                            </Form.Control.Feedback>
                        )}
                      </div>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="tournament-break-duration">
                      <Form.Label className="small fw-bold text-uppercase text-muted">{t('ui:label.breakDuration')}</Form.Label>
                      <div className="input-group">
                        <Form.Control
                          type="number"
                          value={breakDuration}
                          onChange={(e) => setBreakDuration(parseInt(e.target.value) || 0)}
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
                    id="generate-teams"
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

                {((selectedTemplate || selectedCustomTemplate) && !isTeamCountValid) && (
                  <Alert variant="warning" className="mt-3 mb-0">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    {t('modal:tournamentGenerator.insufficientTeams', { 
                        min: selectedTemplate ? selectedTemplate.teamCount.min : (selectedCustomTemplate?.num_teams || 0) 
                    })}
                  </Alert>
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
          disabled={!canGenerate}
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
