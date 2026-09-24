/**
 * StagesOverviewPanel Component
 *
 * Always-available summary of every stage in the design and which teams
 * play in it, independent of Expert Mode. A stage spanning multiple fields
 * (`StageNodeData.fieldIds`) renders once per field it's assigned to
 * elsewhere in the canvas -- this panel exists precisely so a stage's full
 * picture (every field it runs on, every team in its one combined table)
 * is visible in a single place, rather than having to piece it together by
 * scrolling between field sections.
 */

import React, { useCallback, useMemo } from 'react';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import OverviewCard from './OverviewCard';
import type { FlowNode, GlobalTeam, HighlightedElement, GameNode, StageNode } from '../types/flowchart';
import { isGameNode, isStageNode, getStageFieldIds, getFieldNodes } from '../types/flowchart';
import { formatTeamReference } from '../utils/teamReference';

export interface StagesOverviewPanelProps {
  nodes: FlowNode[];
  globalTeams: GlobalTeam[];
  onHighlightElement: (id: string, type: HighlightedElement['type']) => void;
}

const StagesOverviewPanel: React.FC<StagesOverviewPanelProps> = ({ nodes, globalTeams, onHighlightElement }) => {
  const { t } = useTypedTranslation(['ui']);

  const handleActivateKeyDown = useCallback((e: React.KeyboardEvent, activate: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  }, []);

  const teamLabelById = useMemo(() => new Map(globalTeams.map((gt) => [gt.id, gt.label])), [globalTeams]);
  const fieldNodes = useMemo(() => getFieldNodes(nodes), [nodes]);

  const stageSummaries = useMemo(() => {
    const stageNodes = nodes.filter(isStageNode) as StageNode[];
    return stageNodes
      .slice()
      .sort((a, b) => a.data.order - b.data.order)
      .map((stage) => {
        const games = nodes.filter(
          (n): n is GameNode => isGameNode(n) && n.parentId === stage.id
        );

        const teamLabels = new Set<string>();
        const addTeam = (teamId: string | null, dynamic: GameNode['data']['homeTeamDynamic']) => {
          if (dynamic) {
            teamLabels.add(formatTeamReference(dynamic));
          } else if (teamId) {
            teamLabels.add(teamLabelById.get(teamId) ?? teamId);
          }
        };
        games.forEach((g) => {
          addTeam(g.data.homeTeamId, g.data.homeTeamDynamic);
          addTeam(g.data.awayTeamId, g.data.awayTeamDynamic);
        });

        const fieldIds = getStageFieldIds(stage);
        const fieldNames = fieldNodes
          .filter((f) => fieldIds.includes(f.id))
          .map((f) => f.data.name);

        return {
          stage,
          gameCount: games.length,
          teamLabels: Array.from(teamLabels).sort(),
          fieldNames,
        };
      });
  }, [nodes, teamLabelById, fieldNodes]);

  if (stageSummaries.length === 0) return null;

  return (
    <OverviewCard
      testId="stages-overview-panel"
      headerTestId="stages-overview-header"
      iconClass="bi-diagram-3"
      title={t('ui:label.stagesOverview', 'Stages Overview')}
      badge={
        <span className="badge bg-light text-dark border" data-testid="stages-overview-count">
          {t('ui:label.stageCount', '{{count}} stages', { count: stageSummaries.length })}
        </span>
      }
    >
      <ul className="list-unstyled mb-0">
        {stageSummaries.map(({ stage, teamLabels, fieldNames, gameCount }) => {
          const highlightThisStage = () => onHighlightElement(stage.id, 'stage');
          return (
            <li
              key={stage.id}
              className="mb-3"
              role="button"
              tabIndex={0}
              onClick={highlightThisStage}
              onKeyDown={(e) => handleActivateKeyDown(e, highlightThisStage)}
              data-testid={`stages-overview-${stage.id}`}
            >
              <div className="d-flex align-items-center gap-2 mb-1">
                <strong>{stage.data.name}</strong>
                {fieldNames.length > 1 ? (
                  <span className="badge bg-info text-dark" title={t('ui:hint.multiFieldStageRuns', "Runs across multiple fields, all feeding one combined table")}>
                    <i className="bi bi-grid-3x3-gap me-1"></i>
                    {fieldNames.join(', ')}
                  </span>
                ) : (
                  <span className="text-muted small">{fieldNames[0]}</span>
                )}
                <span className="text-muted small">
                  {t('ui:label.gameCount', '{{count}} games', { count: gameCount })}
                </span>
              </div>
              <div className="small text-muted">
                {teamLabels.length > 0
                  ? teamLabels.join(', ')
                  : t('ui:message.stageOverviewNoTeams', 'No teams assigned yet')}
              </div>
            </li>
          );
        })}
      </ul>
    </OverviewCard>
  );
};

export default StagesOverviewPanel;
