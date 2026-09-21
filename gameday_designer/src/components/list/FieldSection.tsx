/**
 * FieldSection Component
 *
 * Displays a collapsible field container with nested stage sections.
 */

import React, { useState, useCallback, memo, useMemo } from 'react';
import { Card, Button } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import StageSection from './StageSection';
import type { 
  FieldNode, 
  StageNode, 
  FlowNode, 
  FlowEdge, 
  GlobalTeam, 
  GlobalTeamGroup,
  HighlightedElement
} from '../../types/flowchart';
import type { SwissTournamentState } from '../../types/flowchart';
import type { StageSwissProgress } from './StageSection';
import type { GameProgressionCellResult } from '../../types/progression';
import { ICONS } from '../../utils/iconConstants';
import './FieldSection.css';

export interface FieldSectionProps {
  field: FieldNode;
  stages: StageNode[];
  allNodes: FlowNode[];
  edges: FlowEdge[];
  globalTeams: GlobalTeam[];
  globalTeamGroups: GlobalTeamGroup[];
  highlightedElement?: HighlightedElement | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onAddStage: (fieldId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onHighlightElement: (id: string, type: import('../../types/flowchart').HighlightedElement['type']) => void;
  selectedNodeId: string | null;
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  onSwapTeams: (gameId: string) => void;
  onAddGame: (stageId: string) => void;
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  onAddStageToGameEdge: (sourceStageId: string, sourceRank: number, targetGameId: string, targetSlot: 'home' | 'away', sourceGroup?: string) => void;
  onRemoveEdgeFromSlot: (targetGameId: string, targetSlot: 'home' | 'away') => void;
  onOpenResultModal: (gameId: string) => void;
  isExpanded: boolean;
  expandedStageIds: Set<string>;
  highlightedSourceGameId?: string | null;
  onDynamicReferenceClick: (sourceGameId: string) => void;
  onNotify?: (message: string, type: import('../../types/designer').NotificationType, title?: string) => void;
  onMoveGame?: (gameId: string, targetStageId: string) => void;
  readOnly?: boolean;
  /** Expert Mode (see `useExpertMode.ts`) — off by default. */
  expertMode?: boolean;
  /** Per-game simulated progression, from `useProgressionInspection`. */
  progressionByGameId?: Map<string, GameProgressionCellResult>;
  /** Swiss tournament state (rounds_total, completedRounds) — drives per-round Progress buttons. */
  swiss?: SwissTournamentState;
  /** Called with the round number when a swiss Progress button is clicked. */
  onProgressSwissRound?: (roundNumber: number) => void;
}

/**
 * Round number for a Swiss round stage (`swiss-round-{n}` seeded by setup()).
 * Falls back to order+1 for swiss-mode stages with non-standard ids; null for
 * non-swiss stages.
 */
function getSwissRoundNumber(stage: StageNode): number | null {
  const match = /^swiss-round-(\d+)$/.exec(stage.id);
  if (match) return parseInt(match[1], 10);
  if (stage.data.progressionMode === 'swiss') return stage.data.order + 1;
  return null;
}

/**
 * Derive the per-stage Swiss Progress control from the tournament state.
 * Next round (completedRounds.length + 1) is generatable, later rounds wait
 * for results, past rounds are complete. Returns undefined for non-swiss
 * stages or when no swiss state / callback is available.
 */
function getSwissProgressForStage(
  stage: StageNode,
  swissState: SwissTournamentState | undefined,
  onProgress: ((roundNumber: number) => void) | undefined
): StageSwissProgress | undefined {
  if (!swissState || !onProgress) return undefined;
  const roundNumber = getSwissRoundNumber(stage);
  if (roundNumber === null) return undefined;
  const nextRound = (swissState.completedRounds?.length ?? 0) + 1;
  const status =
    roundNumber < nextRound ? 'complete' : roundNumber === nextRound ? 'generatable' : 'waiting';
  return { roundNumber, status, onProgress: () => onProgress(roundNumber) };
}

const FieldSection: React.FC<FieldSectionProps> = memo(({
  field,
  stages,
  allNodes,
  edges,
  globalTeams,
  globalTeamGroups,
  highlightedElement,
  onUpdate,
  onDelete,
  onAddStage,
    onSelectNode,
    onHighlightElement,
    selectedNodeId,
  onAssignTeam,
  onSwapTeams,
  onAddGame,
  onAddGameToGameEdge,
    onAddStageToGameEdge,
    onRemoveEdgeFromSlot,
    onOpenResultModal,
    isExpanded: isExpandedProp,

  expandedStageIds,
  highlightedSourceGameId,
  onDynamicReferenceClick,
  onNotify,
  onMoveGame,
  readOnly = false,
  expertMode = false,
  progressionByGameId,
  swiss,
  onProgressSwissRound,
}) => {
  const { t } = useTypedTranslation(['ui']);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(field.data.name);
  const [localExpanded, setLocalExpanded] = useState(true);
  
  // Combine local state with prop (if prop is true, it overrides local state)
  const isExpanded = isExpandedProp || localExpanded;

  const sortedStages = useMemo(() => 
    [...stages].sort((a, b) => a.data.order - b.data.order),
    [stages]
  );

  const isSelected = selectedNodeId === field.id;
  const isHighlighted = highlightedElement?.id === field.id && highlightedElement?.type === 'field';

  const handleToggleExpand = useCallback(() => {
    setLocalExpanded((prev) => !prev);
  }, []);

  const handleAddStage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAddStage(field.id);
    },
    [field.id, onAddStage]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(field.id);
    },
    [field.id, onDelete]
  );

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
    setEditedName(field.data.name);
  }, [field.data.name]);

  const handleSaveName = useCallback(() => {
    setIsEditingName(false);
    if (editedName.trim() !== '' && editedName !== field.data.name) {
      onUpdate(field.id, { name: editedName.trim() });
    } else {
      setEditedName(field.data.name);
    }
  }, [editedName, field.id, field.data.name, onUpdate]);

  const handleNameKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveName();
      } else if (e.key === 'Escape') {
        setIsEditingName(false);
        setEditedName(field.data.name);
      }
    },
    [handleSaveName, field.data.name]
  );

  const handleSelectField = useCallback(() => {
    onSelectNode(field.id);
  }, [field.id, onSelectNode]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onUpdate(field.id, { color: e.target.value });
  }, [field.id, onUpdate]);

  return (
    <Card
      id={`field-${field.id}`}
      className={`field-section mb-3 ${isSelected ? 'selected' : ''} ${isHighlighted ? 'element-highlighted' : ''}`}
      onClick={handleSelectField}
    >
      <Card.Header
        className="field-section__header d-flex align-items-center"
        onClick={handleToggleExpand}
        style={{
          cursor: 'pointer',
          borderLeft: `4px solid ${field.data.color || '#0dcaf0'}`,
        }}
      >
        <i className={`bi ${isExpanded ? ICONS.EXPANDED : ICONS.COLLAPSED} me-2`}></i>

        {isEditingName ? (
          <input
            type="text"
            className="form-control form-control-sm me-2 me-auto"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyPress}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{ maxWidth: '200px' }}
          />
        ) : (
          <>
            <strong className="me-2">{field.data.name}</strong>
            {!readOnly && (
              <Button
                size="sm"
                variant="link"
                onClick={handleStartEdit}
                aria-label={t('ui:tooltip.editFieldName')}
                className="p-0 me-auto btn-adaptive"
                style={{ fontSize: '0.875rem' }}
                title={t('ui:tooltip.editFieldName')}
              >
                <i className={`bi ${ICONS.PENCIL_SMALL}`}></i>
                <span className="btn-label-adaptive">{t('ui:button.edit')}</span>
              </Button>
            )}
            {readOnly && <span className="me-auto" />}
          </>
        )}

        {!readOnly && (
          <button
            className="btn btn-sm btn-outline-primary btn-adaptive me-2"
            onClick={handleAddStage}
            aria-label={t('ui:button.addStage')}
            title={t('ui:tooltip.addStage')}
            data-testid="add-stage-button"
          >
            <i className={`bi ${ICONS.ADD} me-2`}></i>
            <span className="btn-label-adaptive">{t('ui:button.addStage')}</span>
          </button>
        )}

        <input
          type="color"
          value={field.data.color || '#d1ecf1'}
          onChange={handleColorChange}
          onClick={(e) => e.stopPropagation()}
          title={t('ui:tooltip.fieldColor')}
          className="me-2"
          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '50%', cursor: 'pointer' }}
          disabled={readOnly}
        />

        {!readOnly && (
          <Button 
            variant="outline-danger" 
            size="sm" 
            onClick={handleDelete} 
            aria-label={t('ui:tooltip.deleteField')}
            className="btn-adaptive"
            title={t('ui:tooltip.deleteField')}
          >
            <i className={`bi ${ICONS.DELETE}`}></i>
          </Button>
        )}
      </Card.Header>

      {isExpanded && (
        <Card.Body className="field-section__body">
          {sortedStages.length === 0 ? (
            <div className="text-center py-4">
              <i className={`bi ${ICONS.STAGE} me-2`} style={{ fontSize: '2rem', opacity: 0.3 }}></i>
              <p className="text-muted mb-3">{t('ui:message.noStagesYet')}</p>
              {!readOnly && (
                <button 
                  className="btn btn-outline-primary btn-adaptive px-4"
                  onClick={handleAddStage} 
                  aria-label={t('ui:button.addStage')} 
                  title={t('ui:tooltip.addStage')}
                >
                  <i className={`bi ${ICONS.ADD} me-2`}></i>
                  <span className="btn-label-adaptive">{t('ui:button.addStage')}</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {sortedStages.map((stage) => (
                <StageSection
                  key={stage.id}
                  stage={stage}
                  allNodes={allNodes}
                  edges={edges}
                  globalTeams={globalTeams}
                  globalTeamGroups={globalTeamGroups}
                  highlightedElement={highlightedElement}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                onSelectNode={onSelectNode}
                onHighlightElement={onHighlightElement}
                selectedNodeId={selectedNodeId}
                  onAssignTeam={onAssignTeam}
                  onSwapTeams={onSwapTeams}
                  onAddGame={onAddGame}
                  onAddGameToGameEdge={onAddGameToGameEdge}
                onAddStageToGameEdge={onAddStageToGameEdge}
                onRemoveEdgeFromSlot={onRemoveEdgeFromSlot}
                onOpenResultModal={onOpenResultModal}
                isExpanded={expandedStageIds?.has?.(stage.id)}

                  highlightedSourceGameId={highlightedSourceGameId}
                  onDynamicReferenceClick={onDynamicReferenceClick}
                  onNotify={onNotify}
                  onMoveGame={onMoveGame}
                  readOnly={readOnly}
                  expertMode={expertMode}
                  progressionByGameId={progressionByGameId}
                  swiss={getSwissProgressForStage(stage, swiss, onProgressSwissRound)}
                />
              ))}
            </>
          )}
        </Card.Body>
      )}
    </Card>
  );
});

export default FieldSection;
