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

import React, { useCallback, useMemo } from 'react';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import OverviewCard from './OverviewCard';
import type { FlowNode, HighlightedElement, StageNode } from '../types/flowchart';
import { isGameNode, isStageNode, getFieldNodes, getStageFieldIds } from '../types/flowchart';
import { getGamesInStage } from '../utils/edgeAnalysis';
import type { ProgressionFinding, ProgressionSimulationResult } from '../types/progression';
import { getProgressionFindingMessage } from '../utils/progressionMessages';
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

  const gameById = useMemo(() => new Map(nodes.filter(isGameNode).map((n) => [n.id, n])), [nodes]);
  const stageById = useMemo(() => new Map(nodes.filter(isStageNode).map((n) => [n.id, n])), [nodes]);

  // Returns null (rather than guessing 'game') when the id matches neither
  // map — e.g. a stale finding whose node was deleted after the simulation
  // ran. Guessing would send the click-to-highlight machinery looking for a
  // game that was never there instead of simply doing nothing.
  const highlightTypeFor = useCallback(
    (nodeId: string): HighlightedElement['type'] | null =>
      gameById.has(nodeId) ? 'game' : stageById.has(nodeId) ? 'stage' : null,
    [gameById, stageById]
  );

  const getFindingMessage = useCallback((finding: ProgressionFinding) => getProgressionFindingMessage(finding, t), [t]);

  const handleFindingClick = useCallback(
    (finding: ProgressionFinding) => {
      const nodeId = finding.affectedNodes[0];
      if (!nodeId) return;
      const type = highlightTypeFor(nodeId);
      if (type) onHighlightElement(nodeId, type);
    },
    [onHighlightElement, highlightTypeFor]
  );

  /** Enter/Space activates a clickable row the same way a click would. */
  const handleActivateKeyDown = useCallback((e: React.KeyboardEvent, activate: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  }, []);

  const fields = useMemo(() => getFieldNodes(nodes), [nodes]);
  // Iterate stages directly, once each -- not nested under fields. A stage
  // spanning multiple fields (StageNodeData.fieldIds) has one combined
  // game list regardless of which field each game is actually on
  // (getGamesInStage is already field-agnostic), so nesting under a single
  // field here would only ever show that stage under its home field and
  // hide its games on any other field it spans.
  const stagesSorted = useMemo(
    () => (nodes.filter(isStageNode) as StageNode[]).slice().sort((a, b) => a.data.order - b.data.order),
    [nodes]
  );

  const findingIconFor = (type: ProgressionFinding['type']) =>
    type === 'undecided_tie' ? ICONS.INFO : ICONS.WARNING;

  const hasContent = progression.cellsByGameId.size > 0 || progression.findings.length > 0;

  return (
    <OverviewCard
      testId="progression-inspector-panel"
      iconClass={ICONS.EXPERT_MODE}
      title={t('ui:label.progressionInspector')}
      defaultExpanded
      badge={
        progression.findings.length > 0 ? (
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
        )
      }
    >
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
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFindingClick(finding)}
                    onKeyDown={(e) => handleActivateKeyDown(e, () => handleFindingClick(finding))}
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
            {stagesSorted.map((stage) => {
              const games = getGamesInStage(stage.id, nodes);
              if (games.length === 0) return null;
              const fieldNames = fields
                .filter((f) => getStageFieldIds(stage).includes(f.id))
                .map((f) => f.data.name);
              return (
                <div key={stage.id} className="mb-2">
                  <div className="small fw-bold text-muted">
                    {fieldNames.join(', ')} — {stage.data.name}
                  </div>
                  <ul className="list-unstyled mb-0 ps-3">
                    {games.map((game) => {
                      const cell = progression.cellsByGameId.get(game.id);
                      if (!cell) return null;
                      const format = (slot: typeof cell.home) =>
                        slot.teamLabel
                          ? `${slot.teamLabel}${slot.basis === 'projected' ? ` (${t('ui:label.expertModeProjectedShort')})` : ''}`
                          : t('ui:label.expertModeTbd');
                      const highlightThisGame = () => onHighlightElement(game.id, 'game');
                      return (
                        <li
                          key={game.id}
                          className="progression-outcome-row small"
                          role="button"
                          tabIndex={0}
                          onClick={highlightThisGame}
                          onKeyDown={(e) => handleActivateKeyDown(e, highlightThisGame)}
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
        </>
      )}
    </OverviewCard>
  );
};

export default ProgressionInspectorPanel;
