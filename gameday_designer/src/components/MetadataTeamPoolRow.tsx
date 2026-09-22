/**
 * MetadataTeamPoolRow Component
 *
 * Unified component that combines the gameday metadata accordion and team pool card
 * in a responsive row layout. At 1600px+, displays side-by-side (600px each).
 * Below 1600px, stacks vertically.
 *
 * Receives collapsed state from parent (ListDesignerApp controls scroll-triggered collapse).
 */

import React, { useCallback } from 'react';
import { Button } from 'react-bootstrap';
import { useTypedTranslation } from '../i18n/useTypedTranslation';
import GamedayMetadataAccordion from './GamedayMetadataAccordion';
import TopRowAccordionCard from './TopRowAccordionCard';
import GlobalTeamTable from './list/GlobalTeamTable';
import type { GamedayMetadata, FlowValidationResult, HighlightedElement } from '../types/flowchart';
import type { FlowNode, GlobalTeam, GlobalTeamGroup } from '../types/flowchart';
import { ICONS } from '../utils/iconConstants';
import './MetadataTeamPoolRow.css';

export interface MetadataTeamPoolRowProps {
  // Metadata accordion props
  metadata: GamedayMetadata;
  gamedayId?: number;
  onUpdateMetadata: (data: Partial<GamedayMetadata>) => void;
  onClearAll: () => void;
  onDeleteGameday: () => void;
  onPublishGameday: () => void;
  onUnlockGameday: () => Promise<void>;
  validation: FlowValidationResult;
  onHighlightElement: (id: string, type: HighlightedElement['type']) => void;
  highlightedElement?: HighlightedElement | null;
  readOnly?: boolean;
  hasData?: boolean;
  isCollapsed: boolean;

  // Team pool props
  globalTeams: GlobalTeam[];
  globalTeamGroups: GlobalTeamGroup[];
  allNodes: FlowNode[];
  onAddGlobalTeam: (groupId: string) => void;
  onUpdateGlobalTeam: (teamId: string, data: Partial<Omit<GlobalTeam, 'id'>>) => void;
  onDeleteGlobalTeam: (teamId: string) => void;
  onReorderGlobalTeam: (teamId: string, direction: 'up' | 'down') => void;
  onAddGlobalTeamGroup: () => void;
  onUpdateGlobalTeamGroup: (groupId: string, data: Partial<Omit<GlobalTeamGroup, 'id'>>) => void;
  onDeleteGlobalTeamGroup: (groupId: string) => void;
  onReorderGlobalTeamGroup: (groupId: string, direction: 'up' | 'down') => void;
  onShowTeamSelection: (id: string, mode: 'group' | 'replace' | 'official' | 'home' | 'away') => void;
  getTeamUsage: (teamId: string) => { gameId: string; slot: 'home' | 'away' }[];
  onAddOfficials?: () => void;

  // Optional third top-row card (e.g. the Swiss standings/control panel).
  swissPanel?: React.ReactNode;
}

const MetadataTeamPoolRow: React.FC<MetadataTeamPoolRowProps> = ({
  // Metadata props
  metadata,
  gamedayId,
  onUpdateMetadata,
  onClearAll,
  onDeleteGameday,
  onPublishGameday,
  onUnlockGameday,
  validation,
  onHighlightElement,
  highlightedElement,
  readOnly = false,
  hasData = false,
  isCollapsed,

  // Team pool props
  globalTeams,
  globalTeamGroups,
  allNodes,
  onAddGlobalTeam,
  onUpdateGlobalTeam,
  onDeleteGlobalTeam,
  onReorderGlobalTeam,
  onAddGlobalTeamGroup,
  onUpdateGlobalTeamGroup,
  onDeleteGlobalTeamGroup,
  onReorderGlobalTeamGroup,
  onShowTeamSelection,
  getTeamUsage,
  onAddOfficials,
  swissPanel,
}) => {
  const { t } = useTypedTranslation(['ui']);

  const handleAddGroupHeader = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddGlobalTeamGroup();
  }, [onAddGlobalTeamGroup]);

  return (
    <div className="metadata-team-pool-row">
      {/* Metadata Accordion */}
      <div className="metadata-team-pool-row__metadata">
        <GamedayMetadataAccordion
          metadata={metadata}
          gamedayId={gamedayId}
          onUpdate={onUpdateMetadata}
          onClearAll={onClearAll}
          onDelete={onDeleteGameday}
          onPublish={onPublishGameday}
          onUnlock={onUnlockGameday}
          validation={validation}
          highlightedElement={highlightedElement}
          onHighlight={onHighlightElement}
          readOnly={readOnly}
          hasData={hasData}
          forceCollapsed={isCollapsed}
        />
      </div>

      {/* Team Pool Card — same Accordion chrome + whole-card collapse as metadata */}
      <div className="metadata-team-pool-row__team-pool">
        <TopRowAccordionCard
          id="team-pool"
          testId="team-pool-card"
          headerTestId="team-pool-header"
          iconClass={ICONS.TEAM}
          title={t('ui:label.teamPool')}
          status={metadata.status}
          forceCollapsed={isCollapsed}
          highlighted={highlightedElement?.id === 'team-pool'}
          actions={
            !readOnly && (
              <>
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={handleAddGroupHeader}
                  className="btn-adaptive"
                  title={t('ui:tooltip.addGroup')}
                  data-testid="add-team-group-button"
                >
                  <i className={`bi ${ICONS.ADD} me-2`} />
                  <span className="btn-label-adaptive">{t('ui:button.addGroup')}</span>
                </Button>
                {onAddOfficials && (
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddOfficials();
                    }}
                    title={t('ui:tooltip.addExternalOfficials')}
                    data-testid="add-officials-button"
                    disabled={globalTeamGroups.some(g => g.id === 'group-officials')}
                  >
                    <i className="bi bi-person-badge" />
                  </Button>
                )}
              </>
            )
          }
        >
          <GlobalTeamTable
            teams={globalTeams}
            groups={globalTeamGroups}
            highlightedElement={highlightedElement}
            onAddGroup={onAddGlobalTeamGroup}
            onUpdateGroup={onUpdateGlobalTeamGroup}
            onDeleteGroup={onDeleteGlobalTeamGroup}
            onReorderGroup={onReorderGlobalTeamGroup}
            onAddTeam={onAddGlobalTeam}
            onUpdate={onUpdateGlobalTeam}
            onDelete={onDeleteGlobalTeam}
            onReorder={onReorderGlobalTeam}
            onShowTeamSelection={onShowTeamSelection}
            getTeamUsage={getTeamUsage}
            allNodes={allNodes}
            readOnly={readOnly}
          />
        </TopRowAccordionCard>
      </div>

      {/* Swiss control Card — third top-row card after metadata + team pool */}
      {swissPanel && (
        <div className="metadata-team-pool-row__swiss" data-testid="swiss-top-row-card">
          {swissPanel}
        </div>
      )}
    </div>
  );
};

export default MetadataTeamPoolRow;
