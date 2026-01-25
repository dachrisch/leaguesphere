import React, { useState, useRef, useContext } from 'react';
import { Accordion, Form, Row, Col, Button, Overlay, Popover, ListGroup, useAccordionButton, AccordionContext } from 'react-bootstrap';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import type { GamedayMetadata, FlowValidationError as ValidationError, FlowValidationWarning as ValidationWarning, HighlightedElement } from '../types/flowchart';
import type { Season, League } from '../types/api';
import { ICONS } from '../utils/iconConstants';

import './GamedayMetadataAccordion.css';

interface GamedayMetadataAccordionProps {
  metadata: GamedayMetadata;
  onUpdate: (data: Partial<GamedayMetadata>) => void;
  onPublish?: () => void;
  onUnlock?: () => void;
  onClearAll?: () => void;
  onDelete?: () => void;
  seasons?: Season[];
  leagues?: League[];
  hasData?: boolean;
  activeKey?: string | null;
  onSelect?: (key: string | null) => void;
  readOnly?: boolean;
  validation?: {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
  onHighlight?: (id: string, type: HighlightedElement['type']) => void;
}

/**
 * Custom Header component to avoid nested buttons
 */
const CustomAccordionHeader: React.FC<{
  eventKey: string;
  metadata: GamedayMetadata;
  statusColor: string;
  onPublish?: () => void;
  readOnly: boolean;
  validation?: GamedayMetadataAccordionProps['validation'];
  t: ReturnType<typeof useTypedTranslation>;
  formatDate: (d: string) => string;
  getStatusBadge: (s?: string) => React.ReactNode;
  onHighlight?: GamedayMetadataAccordionProps['onHighlight'];
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  validationBadgeRef: React.RefObject<HTMLDivElement | null>;
  showValidationPopover: boolean;
  getHighlightType: (t: string) => HighlightedElement['type'];
  getMessage: (item: ValidationError | ValidationWarning) => string;
}> = ({ 
  eventKey, metadata, statusColor, onPublish, readOnly, validation, t, formatDate, getStatusBadge, onHighlight,
  handleMouseEnter, handleMouseLeave, validationBadgeRef, showValidationPopover, getHighlightType, getMessage
}) => {
  const { activeEventKey } = useContext(AccordionContext);
  const decoratedOnClick = useAccordionButton(eventKey);

  const isCurrentEventKey = activeEventKey === eventKey;

  return (
    <h2 
      className={`accordion-header header-status-${statusColor.toLowerCase()} position-relative`}
      data-testid="gameday-metadata-header"
    >
      <button 
        type="button"
        className={`accordion-button d-flex w-100 justify-content-between align-items-center flex-wrap gap-2 ${isCurrentEventKey ? '' : 'collapsed'}`}
        onClick={decoratedOnClick}
      >
        <div className="d-flex align-items-center gap-2">
          <span className="fw-bold me-2">{metadata.name || t('ui:placeholder.gamedayName')}</span>
          {getStatusBadge(metadata.status)}
          
          {/* Validation Badges - Always Visible */}
          {validation && (
            <div 
              ref={validationBadgeRef}
              className="d-flex gap-1 ms-2" 
              data-testid="validation-badges"
              style={{ cursor: 'pointer' }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => e.stopPropagation()}
            >
              {validation.errors.length > 0 && (
                <span className="badge bg-danger">
                  <i className="bi bi-x-circle-fill me-1"></i>
                  {validation.errors.length}
                </span>
              )}
              {validation.warnings.length > 0 && (
                <span className="badge bg-warning text-dark">
                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                  {validation.warnings.length}
                </span>
              )}
              {validation.isValid && validation.warnings.length === 0 && (
                <span className="badge bg-success">
                  <i className="bi bi-check-circle-fill"></i>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="d-flex align-items-center gap-3 pe-5">
          <span className="text-muted small">
            {formatDate(metadata.date)}
          </span>
          
          {/* Integrated Publish button inside the toggle area */}
          {metadata.status === 'DRAFT' && !readOnly && (
            <Button 
              variant="success" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPublish?.();
              }}
              className="rounded-pill py-0 px-3 border-0 shadow-sm fw-bold d-flex align-items-center ms-3"
              style={{ fontSize: '0.7rem', height: '22px' }}
              data-testid="publish-schedule-button"
            >
              <i className="bi bi-send-fill me-1"></i>
              {t('ui:button.publishSchedule')}
            </Button>
          )}
        </div>
      </button>

      {/* Validation Popover */}
      {validation && (
        <Overlay
          show={showValidationPopover && (validation.errors.length > 0 || validation.warnings.length > 0)}
          target={validationBadgeRef}
          placement="bottom"
        >
          {(props) => (
            <Popover 
              {...props} 
              id="validation-popover" 
              style={{ ...props.style, pointerEvents: 'auto', zIndex: 1060, maxWidth: '400px' }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Popover.Header as="h3" className="d-flex justify-content-between align-items-center py-2">
                <span className="small fw-bold">{t('ui:label.validation', 'Validation')}</span>
              </Popover.Header>
              <Popover.Body className="p-0" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <ListGroup variant="flush">
                  {/* Errors Section */}
                  {validation.errors.map((error, idx) => (
                    <ListGroup.Item 
                      key={`err-${idx}`} 
                      action 
                      onClick={(e) => {
                        e.stopPropagation();
                        onHighlight?.(error.affectedNodes?.[0], getHighlightType(error.type));
                      }}
                      className="d-flex align-items-start border-0 py-2"
                    >
                      <i className="bi bi-exclamation-circle-fill text-danger me-2 mt-1"></i>
                      <div className="small">{getMessage(error)}</div>
                    </ListGroup.Item>
                  ))}
                  
                  {/* Warnings Section */}
                  {validation.warnings.map((warning, idx) => (
                    <ListGroup.Item 
                      key={`warn-${idx}`} 
                      action 
                      onClick={(e) => {
                        e.stopPropagation();
                        onHighlight?.(warning.affectedNodes?.[0], getHighlightType(warning.type));
                      }}
                      className="d-flex align-items-start border-0 py-2"
                    >
                      <i className="bi bi-exclamation-triangle-fill text-warning me-2 mt-1"></i>
                      <div className="small">{getMessage(warning)}</div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Popover.Body>
            </Popover>
          )}
        </Overlay>
      )}
    </h2>
  );
};

const GamedayMetadataAccordion: React.FC<GamedayMetadataAccordionProps> = ({
  metadata,
  onUpdate,
  onPublish,
  onUnlock,
  onClearAll,
  onDelete,
  seasons = [],
  leagues = [],
  hasData = false,
  activeKey,
  onSelect,
  readOnly = false,
  validation,
  onHighlight
}) => {
  const { t } = useTypedTranslation(['ui', 'domain', 'validation']);

  const [showValidationPopover, setShowValidationPopover] = useState(false);
  const validationBadgeRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowValidationPopover(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowValidationPopover(false);
    }, 300);
  };

  const handleChange = (field: keyof GamedayMetadata, value: string | number) => {
    if (readOnly) return;
    onUpdate({ [field]: value });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'warning';
      case 'PUBLISHED': return 'success';
      case 'IN_PROGRESS': return 'primary';
      case 'COMPLETED': return 'secondary';
      default: return 'light';
    }
  };

  const getStatusBadge = (status: string = 'DRAFT') => {
    return (
      <span className="badge bg-secondary border small">
        {t(`domain:status.${(status || 'DRAFT').toLowerCase()}`, status)}
      </span>
    );
  };

  const getMessage = (item: ValidationError | ValidationWarning) => {
    if (item.messageKey) {
      return t(`validation:${item.messageKey}` as const, item.messageParams);
    }
    return item.message;
  };

  const getHighlightType = (errorType: string): HighlightedElement['type'] => {
    if (errorType === 'field_overlap' || errorType === 'team_overlap' || errorType === 'no_games' || errorType === 'broken_progression') return 'game';
    if (errorType.includes('stage')) return 'stage';
    if (errorType.includes('field')) return 'field';
    if (errorType.includes('team')) return 'team';
    return 'game';
  };

  const statusColor = getStatusColor(metadata.status);

  return (
    <div style={{ maxWidth: '1000px', width: '100%' }} className="gameday-metadata-accordion mx-auto">
      <Accordion 
        activeKey={activeKey} 
        onSelect={(key) => onSelect?.(key as string | null)}
        className="mb-3"
      >
        <Accordion.Item eventKey="0" className="border-0 shadow-sm">
          <CustomAccordionHeader 
            eventKey="0"
            metadata={metadata}
            statusColor={statusColor}
            onPublish={onPublish}
            readOnly={readOnly}
            validation={validation}
            t={t}
            formatDate={formatDate}
            getStatusBadge={getStatusBadge}
            onHighlight={onHighlight}
            handleMouseEnter={handleMouseEnter}
            handleMouseLeave={handleMouseLeave}
            validationBadgeRef={validationBadgeRef}
            showValidationPopover={showValidationPopover}
            getHighlightType={getHighlightType}
            getMessage={getMessage}
          />
          <Accordion.Body>
            <Form>
              <Row className="mb-3">
                <Col md={6}>
                  <Form.Group controlId="gamedayName">
                    <Form.Label>{t('ui:label.name', 'Name')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={metadata.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      disabled={readOnly}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group controlId="gamedayDate">
                    <Form.Label>{t('ui:label.date', 'Date')}</Form.Label>
                    <Form.Control
                      type="date"
                      value={metadata.date}
                      onChange={(e) => handleChange('date', e.target.value)}
                      disabled={readOnly}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group controlId="gamedayStart">
                    <Form.Label>{t('ui:label.startTime', 'Start Time')}</Form.Label>
                    <Form.Control
                      type="time"
                      value={metadata.start}
                      onChange={(e) => handleChange('start', e.target.value)}
                      disabled={readOnly}
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row className="mb-3">
                <Col md={12}>
                  <Form.Group controlId="gamedayVenue">
                    <Form.Label>{t('ui:label.venue', 'Venue')}</Form.Label>
                    <Form.Control
                      type="text"
                      value={metadata.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      disabled={readOnly}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row className="mb-4">
                <Col md={6}>
                  <Form.Group controlId="gamedaySeason">
                    <Form.Label>{t('ui:label.season', 'Season')}</Form.Label>
                    <Form.Select
                      value={metadata.season}
                      onChange={(e) => handleChange('season', parseInt(e.target.value, 10))}
                      disabled={readOnly}
                    >
                      <option value="0">--- {t('ui:placeholder.selectSeason', 'Select Season')} ---</option>
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="gamedayLeague">
                    <Form.Label>{t('ui:label.league', 'League')}</Form.Label>
                    <Form.Select
                      value={metadata.league}
                      onChange={(e) => handleChange('league', parseInt(e.target.value, 10))}
                      disabled={readOnly}
                    >
                      <option value="0">--- {t('ui:placeholder.selectLeague', 'Select League')} ---</option>
                      {leagues.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <hr />

              <div className="d-flex justify-content-between align-items-center mt-3">
                <div className="d-flex gap-2">
                  {metadata.status !== 'DRAFT' && (
                    <Button 
                      variant="warning" 
                      size="sm"
                      onClick={onUnlock}
                      className="px-3"
                    >
                      <i className="bi bi-unlock-fill me-2"></i>
                      {t('ui:button.unlockSchedule')}
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline-warning" 
                    size="sm"
                    onClick={onClearAll}
                    disabled={!hasData || metadata.status !== 'DRAFT'}
                    className="px-3"
                  >
                    <i className={`bi ${ICONS.CLEAR} me-2`}></i>
                    {t('ui:button.clearSchedule')}
                  </Button>
                </div>

                <Button 
                  variant="outline-danger" 
                  size="sm"
                  onClick={onDelete}
                  disabled={metadata.status !== 'DRAFT'}
                  className="px-3"
                >
                  <i className={`bi ${ICONS.TRASH} me-2`}></i>
                  {t('ui:button.deleteGameday')}
                </Button>
              </div>
            </Form>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </div>
  );
};

export default GamedayMetadataAccordion;