/**
 * OverviewCard Component
 *
 * Shared chrome + collapse pattern for the designer overview row
 * (Stages Overview, Swiss standings, Progression Inspector): a Card whose
 * header is a keyboard-focusable toggle (role=button, aria-expanded,
 * Enter/Space support). Collapsed by default (override with
 * `defaultExpanded`); the body renders conditionally -- not via Collapse --
 * so a collapsed card never puts its content into the DOM twice, which
 * would hit every test and every "find by text" lookup elsewhere on the
 * page (the overview cards mount unconditionally on every canvas).
 */

import React, { useState, useCallback } from 'react';
import { Card } from 'react-bootstrap';
import { ICONS } from '../utils/iconConstants';
import './OverviewCard.css';

export interface OverviewCardProps {
  testId: string;
  headerTestId?: string;
  iconClass: string;
  title: React.ReactNode;
  /** Optional badge next to the title (e.g. the stage count or round indicator). */
  badge?: React.ReactNode;
  /** Start expanded instead of collapsed. */
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const OverviewCard: React.FC<OverviewCardProps> = ({
  testId,
  headerTestId,
  iconClass,
  title,
  badge,
  defaultExpanded = false,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleActivateKeyDown = useCallback((e: React.KeyboardEvent, activate: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  }, []);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <Card className="overview-card mb-3" data-testid={testId}>
      <Card.Header
        className="overview-card__header d-flex align-items-center"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggle}
        onKeyDown={(e) => handleActivateKeyDown(e, toggle)}
        style={{ cursor: 'pointer' }}
        data-testid={headerTestId}
      >
        <i className={`bi ${isExpanded ? ICONS.EXPANDED : ICONS.COLLAPSED} me-2`}></i>
        <i className={`bi ${iconClass} me-2`}></i>
        <strong className="me-auto">{title}</strong>
        {badge}
      </Card.Header>
      {isExpanded && <Card.Body>{children}</Card.Body>}
    </Card>
  );
};

export default OverviewCard;
