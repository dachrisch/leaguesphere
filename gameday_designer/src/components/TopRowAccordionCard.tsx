/**
 * TopRowAccordionCard Component
 *
 * Shared chrome + collapse pattern for the designer top-row cards (Team Pool,
 * Swiss control), mirroring the metadata (masterdata) card
 * (GamedayMetadataAccordion): an Accordion.Item with a plain
 * `accordion-button` header. The yellow status tint is reserved for the
 * metadata card only — pool + control headers render plain. Collapsing
 * unmounts the whole card body (Accordion collapse via activeKey) instead of
 * leaving an empty Card frame.
 *
 * Each card keeps independent collapse state; the scroll-driven
 * `forceCollapsed` prop collapses like metadata's (and never auto-reopens).
 */

import React, { useContext, useEffect, useState } from 'react';
import { Accordion, AccordionContext, Collapse, useAccordionButton } from 'react-bootstrap';
import './TopRowAccordionCard.css';

const EVENT_KEY = '0';

/** Accordion event key shared by all top-row cards (single-item accordions). */
export const TOP_ROW_EVENT_KEY = EVENT_KEY;

const CardHeaderToggle: React.FC<{
  iconClass: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
}> = ({ iconClass, title, badge }) => {
  const { activeEventKey } = useContext(AccordionContext);
  const onClick = useAccordionButton(EVENT_KEY);
  const collapsed = activeEventKey !== EVENT_KEY;

  return (
    <button
      type="button"
      className={`accordion-button d-flex w-100 justify-content-between align-items-center flex-wrap gap-2 ${collapsed ? 'collapsed' : ''}`}
      onClick={onClick}
    >
      <div className="d-flex align-items-center gap-2">
        <i className={`bi ${iconClass} me-2`} aria-hidden="true" />
        <strong>{title}</strong>
        {badge}
      </div>
      <div className="d-flex align-items-center gap-3 pe-5" />
    </button>
  );
};

export interface TopRowAccordionCardProps {
  id?: string;
  testId: string;
  headerTestId?: string;
  iconClass: string;
  title: React.ReactNode;
  /** Optional badge next to the title (e.g. the Swiss round indicator). */
  badge?: React.ReactNode;
  /** Header action buttons (rendered outside the toggle, like metadata's publish button). */
  actions?: React.ReactNode;
  /** Scroll-driven collapse from the parent row (mirrors metadata forceCollapsed). */
  forceCollapsed?: boolean;
  highlighted?: boolean;
  children: React.ReactNode;
}

const TopRowAccordionCard: React.FC<TopRowAccordionCardProps> = ({
  id,
  testId,
  headerTestId,
  iconClass,
  title,
  badge,
  actions,
  forceCollapsed = false,
  highlighted = false,
  children,
}) => {
  // Start collapsed when mounted under scroll collapse so the body never
  // flashes mounted (Collapse unmountOnExit only skips mount when `in`
  // is false on first render); later changes flow through the effect below.
  const [activeKey, setActiveKey] = useState<string | undefined>(
    forceCollapsed ? undefined : EVENT_KEY,
  );

  useEffect(() => {
    if (forceCollapsed && activeKey !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveKey(undefined);
    }
  }, [forceCollapsed, activeKey]);

  return (
    <div
      className={`top-row-accordion ${highlighted ? 'is-highlighted' : ''}`}
      id={id}
      data-testid={testId}
    >
      <Accordion
        activeKey={activeKey}
        onSelect={(k) => {
          const next = k === null ? undefined : Array.isArray(k) ? k[0] : k;
          setActiveKey((prev) => (prev === next ? undefined : next));
        }}
      >
        <Accordion.Item eventKey={EVENT_KEY}>
          <h2
            className="accordion-header position-relative"
            data-testid={headerTestId}
          >
            <CardHeaderToggle iconClass={iconClass} title={title} badge={badge} />
            {actions && (
              <div className="top-row-card-actions" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
          </h2>
          <Collapse in={activeKey === EVENT_KEY} unmountOnExit>
            <div>
              <div className="accordion-body">{children}</div>
            </div>
          </Collapse>
        </Accordion.Item>
      </Accordion>
    </div>
  );
};

export default TopRowAccordionCard;
