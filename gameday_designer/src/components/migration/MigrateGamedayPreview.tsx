/**
 * MigrateGamedayPreview
 *
 * Read-only, in-memory preview of a migrated Gameday Designer canvas. Renders
 * the exact ListCanvas the real designer uses, seeded directly from a computed
 * FlowState -- it never fetches the designer-state endpoint (which does a
 * get_or_create server-side), so nothing is persisted or created until the
 * migration is confirmed.
 */

import React, { useMemo } from 'react';
import ListCanvas from '../ListCanvas';
import { createEmptyFlowValidationResult } from '../../types/flowchart';
import { resolveBracketReferences } from '../../utils/bracketResolution';
import type { FlowState } from '../../types/flowchart';

interface MigrateGamedayPreviewProps {
  state: FlowState;
}

const MigrateGamedayPreview: React.FC<MigrateGamedayPreviewProps> = ({ state }) => {
  // Apply the same bracket-reference resolution the real designer runs on
  // load, so the preview matches what will be rendered after saving.
  const nodes = useMemo(
    () => resolveBracketReferences(state.nodes, state.globalTeams),
    [state.nodes, state.globalTeams]
  );

  const metadata = state.metadata ?? {
    id: 0,
    name: '',
    date: '',
    start: '',
    format: '',
    author: 0,
    address: '',
    season: 0,
    league: 0,
    status: 'DRAFT',
  };

  const noop = useMemo(() => () => {}, []);
  const onUnlock = useMemo(() => async () => {}, []);

  return (
    <ListCanvas
      gamedayId={metadata.id}
      nodes={nodes}
      edges={state.edges}
      globalTeams={state.globalTeams}
      globalTeamGroups={state.globalTeamGroups}
      onUpdateNode={noop}
      onDeleteNode={noop}
      onAddField={noop}
      onAddStage={noop}
      onSelectNode={noop}
      onHighlightElement={noop}
      selectedNodeId={null}
      onAddGlobalTeam={noop}
      onUpdateGlobalTeam={noop}
      onDeleteGlobalTeam={noop}
      onReorderGlobalTeam={noop}
      onAddGlobalTeamGroup={noop}
      onUpdateGlobalTeamGroup={noop}
      onDeleteGlobalTeamGroup={noop}
      onReorderGlobalTeamGroup={noop}
      onShowTeamSelection={noop}
      getTeamUsage={() => []}
      onAssignTeam={noop}
      onSwapTeams={noop}
      onAddGame={noop}
      onAddGameToGameEdge={noop}
      onAddStageToGameEdge={noop}
      onRemoveEdgeFromSlot={noop}
      onOpenResultModal={noop}
      expandedFieldIds={new Set()}
      expandedStageIds={new Set()}
      onDynamicReferenceClick={noop}
      readOnly
      metadata={metadata}
      onUpdateMetadata={noop}
      onClearAll={noop}
      onDeleteGameday={noop}
      onPublishGameday={noop}
      onUnlockGameday={onUnlock}
      validation={createEmptyFlowValidationResult()}
      isRowCollapsed={false}
    />
  );
};

export default MigrateGamedayPreview;