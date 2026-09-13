/**
 * ProgressionInspectorPanel Component
 *
 * Expert-Mode-only panel showing the full simulated bracket/schedule outcome
 * (which team each game's home/away/official slot would resolve to, if the
 * bracket played out) plus every expert-only correctness finding
 * (dangling references, unreachable placeholders, unresolved cycles,
 * undecided ties) produced by `progressionSimulator.ts`.
 *
 * Purely observational: nothing here ever blocks saving or exporting. This
 * component doesn't even mount unless Expert Mode is on — see `ListCanvas.tsx`.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Card, Collapse } from 'react-bootstrap';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import type { FlowNode, HighlightedElement } from '../types/flowchart';
import { isGameNode, isStageNode, getFieldNodes } from '../types/flowchart';
import { getGamesInStage, getStagesInField } from '../utils/edgeAnalysis';
import type { ProgressionFinding, ProgressionSimulationResult } from '../types/progression';
import { ICONS } from '../utils/iconConstants';
import './ProgressionInspectorPanel.css';

export interface ProgressionInspectorPanelProps {
  nodes: FlowNode[];
  progression: ProgressionSimulationResult;
  onHighlightElement: (id: string, type: HighlightedElement['type']) => void;
}

const ProgressionInspectorPanel: React.FC<ProgressionInspectorPanelProps> = ({
  nodes,
  progression,
  onHighlightElement,
}) => {
  const { t } = useTypedTranslation(['ui', 'validation']);
  const [isExpanded, setIsExpanded] = useState(true);

  const gameById = useMemo(() => new Map(nodes.filter(isGameNode).map((n) => [n.id, n])), [nodes]);
  const stageById = useMemo(() => new Map(nodes.filter(isStageNode).map((n) => [n.id, n])), [nodes]);

  const highlightTypeFor = useCallback(
    (nodeId: string): HighlightedElement['type'] => (gameById.has(nodeId) ? 'game' : stageById.has(nodeId) ? 'stage' : 'game'),
    [gameById, stageById]
  );

  const getFindingMessage = useCallback(
    (finding: ProgressionFinding) =>
      finding.messageKey ? t(`validation:${finding.messageKey}` as const, finding.messageParams) : finding.message,
    [t]
  );

  const handleFindingClick = useCallback(
    (finding: ProgressionFinding) => {
      const nodeId = finding.affectedNodes[0];
      if (nodeId) onHighlightElement(nodeId, highlightTypeFor(nodeId));
    },
    [onHighlightElement, highlightTypeFor]
  );

  const fields = useMemo(() => getFieldNodes(nodes), [nodes]);

  const findingIconFor = (type: ProgressionFinding['type']) =>
    type === 'undecided_tie' ? ICONS.INFO : ICONS.WARNING;

  const hasContent = progression.cellsByGameId.size > 0 || progression.findings.length > 0;

  return (
    <Card className="progression-inspector-panel mb-3" data-testid="progression-inspector-panel">
      <Card.Header
        className="d-flex align-items-center"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{ cursor: 'pointer' }}
      >
        <i className={`bi ${isExpanded ? ICONS.EXPANDED : ICONS.COLLAPSED} me-2`}></i>
        <i className={`bi ${ICONS.EXPERT_MODE} me-2`}></i>
        <strong className="me-auto">{t('ui:label.progressionInspector')}</strong>
        {progression.findings.length > 0 ? (
          <span className="badge bg-warning text-dark" data-testid="progression-findings-badge">
            {t('validation:warningCount', { count: progression.findings.length })}
          </span>
        ) : (
          hasContent && (
            <span className="badge bg-success" data-testid="progression-findings-badge">
              <i className={`bi ${ICONS.VALID} me-1`}></i>
              {t('ui:label.progressionAllClear')}
            </span>
          )
        )}
      </Card.Header>
      <Collapse in={isExpanded}>
        <div>
          <Card.Body>
            {!hasContent ? (
              <p className="text-muted mb-0 small">{t('ui:message.progressionInspectorEmpty')}</p>
            ) : (
              <>
                {progression.findings.length > 0 && (
                  <div className="mb-3">
                    <h6 className="text-uppercase text-muted small mb-2">{t('ui:label.progressionFindings')}</h6>
                    <ul className="list-unstyled mb-0">
                      {progression.findings.map((finding) => (
                        <li
                          key={finding.id}
                          className="progression-finding-row d-flex align-items-start gap-2 py-1"
                          onClick={() => handleFindingClick(finding)}
                          data-testid={`progression-finding-${finding.id}`}
                        >
                          <i className={`bi ${findingIconFor(finding.type)} mt-1`}></i>
                          <span className="small">{getFindingMessage(finding)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h6 className="text-uppercase text-muted small mb-2">{t('ui:label.progressionOutcome')}</h6>
                  {fields.map((field) => (
                    <div key={field.id} className="mb-2">
                      {getStagesInField(field.id, nodes).map((stage) => {
                        const games = getGamesInStage(stage.id, nodes);
                        if (games.length === 0) return null;
                        return (
                          <div key={stage.id} className="mb-2">
                            <div className="small fw-bold text-muted">
                              {field.data.name} — {stage.data.name}
                            </div>
                            <ul className="list-unstyled mb-0 ps-3">
                              {games.map((game) => {
                                const cell = progression.cellsByGameId.get(game.id);
                                if (!cell) return null;
                                const format = (slot: typeof cell.home) =>
                                  slot.teamLabel
                                    ? `${slot.teamLabel}${slot.basis === 'projected' ? ` (${t('ui:label.expertModeProjectedShort')})` : ''}`
                                    : t('ui:label.expertModeTbd');
                                return (
                                  <li
                                    key={game.id}
                                    className="progression-outcome-row small"
                                    onClick={() => onHighlightElement(game.id, 'game')}
                                    data-testid={`progression-outcome-${game.id}`}
                                  >
                                    <strong>{game.data.standing}</strong>: {format(cell.home)} vs {format(cell.away)}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
};

export default ProgressionInspectorPanel;
