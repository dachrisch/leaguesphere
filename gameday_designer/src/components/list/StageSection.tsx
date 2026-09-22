/**
 * StageSection Component
 *
 * Displays a collapsible stage container with game tables.
 */

import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, Button, Form, Dropdown } from 'react-bootstrap';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import GameTable from './GameTable';
import type {
  StageNode,
  FieldNode,
  FlowNode,
  FlowEdge,
  GameNode,
  GlobalTeam,
  GlobalTeamGroup,
  HighlightedElement
} from '../../types/flowchart';
import { isGameNode, isStageNode, getFieldNodes, getStageFieldIds } from '../../types/flowchart';
import type { GameProgressionCellResult } from '../../types/progression';
import { ICONS } from '../../utils/iconConstants';
import { getDraggedGameSourceStageId, getDraggedGameSourceFieldId } from '../../utils/dragState';
import { designerApi } from '../../api/designerApi';
import { parseTime, formatTime, isValidTimeFormat } from '../../utils/timeCalculation';
import './StageSection.css';

export interface StageSectionProps {
  stage: StageNode;
  /**
   * The specific field this card represents. A stage spanning multiple
   * fields (`StageNodeData.fieldIds`) renders once per field it's assigned
   * to -- each rendering only shows the games actually played on that
   * field. The field is purely where a game is played; it never affects
   * the stage's identity or its (single, combined) standings table.
   */
  fieldContext: FieldNode;
  allNodes: FlowNode[];
  edges: FlowEdge[];
  globalTeams: GlobalTeam[];
  globalTeamGroups: GlobalTeamGroup[];
  highlightedElement?: HighlightedElement | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onHighlightElement: (id: string, type: import('../../types/flowchart').HighlightedElement['type']) => void;
  selectedNodeId: string | null;
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  onSwapTeams: (gameId: string) => void;
  onAddGame: (stageId: string, fieldId?: string) => void;
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  onAddStageToGameEdge: (sourceStageId: string, sourceRank: number, targetGameId: string, targetSlot: 'home' | 'away', sourceGroup?: string) => void;
  onRemoveEdgeFromSlot: (targetGameId: string, targetSlot: 'home' | 'away') => void;
  onOpenResultModal: (gameId: string) => void;
  isExpanded: boolean;
  highlightedSourceGameId?: string | null;
  onDynamicReferenceClick: (sourceGameId: string) => void;
  onNotify?: (message: string, type: import('../../types/designer').NotificationType, title?: string) => void;
  onMoveGame?: (gameId: string, targetStageId: string, targetFieldId?: string) => void;
  /** Moves a game between two field-instances of this stage without changing its stage. */
  onMoveGameField?: (gameId: string, targetFieldId: string) => void;
  /** Updates which fields this stage spans, resetting any now-stranded games back to the stage's home field. */
  onUpdateStageFields?: (stageId: string, fieldIds: string[] | undefined) => void;
  /** Merges this stage into another stage (its games, fields, and references fold into the target; this stage is deleted). */
  onMergeStage?: (sourceStageId: string, targetStageId: string) => void;
  readOnly?: boolean;
  /** Expert Mode (see `useExpertMode.ts`) — off by default. */
  expertMode?: boolean;
  /** Per-game simulated progression, from `useProgressionInspection`. */
  progressionByGameId?: Map<string, GameProgressionCellResult>;
  /** Shows a per-game "Day" selector when the gameday is multi-day (see `GamedayMetadata.multiDayEnabled`). */
  multiDayEnabled?: boolean;
  /** Backend gameday PK — required for the Swiss round-times endpoint. */
  gamedayId?: number;
  /**
   * Number of generated Swiss rounds (`swiss.completedRounds.length` from
   * ListCanvas). A bare number, not the whole swiss object. Rounds above
   * this count are future-only: their planned start time is editable.
   */
  swissCompletedRounds?: number;
}

const StageSection: React.FC<StageSectionProps> = memo(({
  stage,
  fieldContext,
  allNodes,
  edges,
  globalTeams,
  globalTeamGroups,
  highlightedElement,
  onUpdate,
  onDelete,
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

  highlightedSourceGameId,
  onDynamicReferenceClick,
  onNotify,
  onMoveGame,
  onMoveGameField,
  onUpdateStageFields,
  onMergeStage,
  readOnly = false,
  expertMode = false,
  progressionByGameId,
  multiDayEnabled = false,
  gamedayId,
  swissCompletedRounds,
}) => {
  const { t } = useTypedTranslation(['ui', 'domain']);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(stage.data.name);
  const [editedStageType, setEditedStageType] = useState(stage.data.stageType || 'STANDARD');
  const [localExpanded, setLocalExpanded] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const editZoneRef = useRef<HTMLDivElement>(null);
  
  // Combine local state with prop
  const isExpanded = isExpandedProp || localExpanded;

  // Only the subset of this stage's games actually played on `fieldContext`
  // -- a game with no explicit `fieldId` plays on the stage's home field
  // (matching the fallback used everywhere else a game's field is
  // resolved, e.g. `getGameField`/`CanvasPublishService`).
  const games = useMemo(
    () =>
      allNodes.filter(
        (node): node is GameNode =>
          isGameNode(node) &&
          node.parentId === stage.id &&
          (node.data.fieldId || stage.parentId) === fieldContext.id
      ),
    [allNodes, stage.id, stage.parentId, fieldContext.id]
  );

  const isHighlighted = highlightedElement?.id === stage.id && highlightedElement?.type === 'stage';

  // Swiss round stage (materialized by the backend with data.swissRound).
  // A round at or below the completed count is generated: its games keep
  // their times, so the Start input is read-only with a localized hint.
  // Rounds above it are future-only and editable via the round-times plan.
  const swissRound = stage.data.swissRound ?? null;
  const swissLocked =
    swissRound !== null &&
    gamedayId !== undefined &&
    swissCompletedRounds !== undefined &&
    swissRound <= swissCompletedRounds;

  const handleToggleExpand = useCallback(() => {
    setLocalExpanded((prev) => !prev);
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(stage.id);
    },
    [stage.id, onDelete]
  );

  const handleStartEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setEditedName(stage.data.name);
      setEditedStageType(stage.data.stageType || 'STANDARD');
    },
    [stage.data.name, stage.data.stageType]
  );

  const handleSaveEdit = useCallback((e?: React.FocusEvent) => {
    // Smart Blur: Only save if focus moves outside the edit zone
    if (e?.relatedTarget && editZoneRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }

    setIsEditing(false);
    const updates: Partial<StageNode['data']> = {};
    
    if (editedName.trim() !== '' && editedName !== stage.data.name) {
      updates.name = editedName.trim();
    }
    
    if (editedStageType !== stage.data.stageType) {
      updates.stageType = editedStageType;
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(stage.id, updates);
    } else {
      setEditedName(stage.data.name);
      setEditedStageType(stage.data.stageType || 'STANDARD');
    }
  }, [editedName, editedStageType, stage.id, stage.data.name, stage.data.stageType, onUpdate]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveEdit();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditedName(stage.data.name);
        setEditedStageType(stage.data.stageType || 'STANDARD');
      }
    },
    [handleSaveEdit, stage.data.name, stage.data.stageType]
  );

  const handleAddGame = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // A new game always plays on the field-instance card it was added
      // from; only pass an explicit fieldId when that's not the stage's
      // home field, so a plain single-field stage keeps behaving exactly
      // as before (no fieldId ever written).
      onAddGame(stage.id, fieldContext.id === stage.parentId ? undefined : fieldContext.id);
    },
    [stage.id, stage.parentId, fieldContext.id, onAddGame]
  );

  const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const value = e.target.value;
    // Swiss round stage (data.swissRound set by the backend) with a known
    // gameday + completed-round count: the round-times endpoint owns the
    // plan for future rounds, so POST first and only apply locally on
    // success. Generated rounds never reach here (input disabled).
    if (swissRound != null && gamedayId !== undefined && swissCompletedRounds !== undefined) {
      // An empty round time is never valid: ignore the clear (revert to the
      // previous value) — no POST, no local apply — so siblings and
      // placeholders stay in sync with the backend plan.
      if (!value) {
        e.target.value = stage.data.startTime || '';
        return;
      }
      void (async () => {
        try {
          await designerApi.updateSwissRoundTimes(gamedayId, { [String(swissRound)]: value });
        } catch {
          onNotify?.(t('ui:notification.swissRoundTimeFailed'), 'danger', t('ui:notification.title.error'));
          return;
        }
        // Round-level plan: retime this stage, its sibling stages for the
        // same round (one per field) and the round's placeholder games via
        // the existing game-update handler (same payload shape the GameTable
        // time pencil uses, minus manualTime — this is plan-driven, so a
        // later plan edit must still win). Games with results keep theirs.
        // Committed handlers feed the debounced autosave; no explicit save.
        // Offset-preserving: each placeholder keeps its offset from the
        // stage's previous start (robust to any backend staggering, e.g.
        // same-field games staggered by slot). Missing/invalid times fall
        // back to newStart (no crash, no NaN).
        const oldRoundStart = stage.data.startTime;
        const roundStageIds = new Set(
          allNodes
            .filter((n) => isStageNode(n) && n.data.swissRound === swissRound)
            .map((n) => n.id),
        );
        for (const id of roundStageIds) {
          onUpdate(id, { startTime: value });
        }
        for (const game of allNodes) {
          if (
            isGameNode(game) &&
            game.parentId !== null &&
            game.parentId !== undefined &&
            roundStageIds.has(game.parentId) &&
            !game.data.final_score &&
            !game.data.halftime_score
          ) {
            let newGameTime = value;
            try {
              if (
                game.data.startTime &&
                oldRoundStart &&
                isValidTimeFormat(game.data.startTime) &&
                isValidTimeFormat(oldRoundStart) &&
                isValidTimeFormat(value)
              ) {
                const offset = parseTime(game.data.startTime) - parseTime(oldRoundStart);
                newGameTime = formatTime(parseTime(value) + offset);
              }
            } catch {
              newGameTime = value;
            }
            onUpdate(game.id, { startTime: newGameTime });
          }
        }
      })();
      return;
    }
    onUpdate(stage.id, { startTime: value || undefined });
  }, [stage.id, stage.data.startTime, onUpdate, swissRound, gamedayId, swissCompletedRounds, allNodes, onNotify, t]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onUpdate(stage.id, { color: e.target.value });
  }, [stage.id, onUpdate]);

  const allFields = useMemo(() => getFieldNodes(allNodes), [allNodes]);
  const stageFieldIds = useMemo(() => getStageFieldIds(stage), [stage]);
  const fieldPosition = useMemo(
    () => Math.max(1, stageFieldIds.indexOf(fieldContext.id) + 1),
    [stageFieldIds, fieldContext.id]
  );
  const otherFieldNames = useMemo(
    () =>
      allFields
        .filter((f) => stageFieldIds.includes(f.id) && f.id !== fieldContext.id)
        .map((f) => f.data.name),
    [allFields, stageFieldIds, fieldContext.id]
  );

  // Every other stage in the gameday, grouped by field, as "Merge into..."
  // targets -- lets a user consolidate this stage into any other one
  // deliberately (fixing a pre-existing duplicate name, or combining two
  // differently-named stages), independent of the automatic name-collision
  // fold-in that happens on create/rename (see useFlowState.ts::mergeStageInto).
  const mergeTargets = useMemo(
    () =>
      allFields
        .map((field) => ({
          field,
          stages: allNodes.filter(
            (n): n is StageNode => isStageNode(n) && n.parentId === field.id && n.id !== stage.id
          ),
        }))
        .filter((entry) => entry.stages.length > 0),
    [allFields, allNodes, stage.id]
  );

  const handleMergeStage = useCallback(
    (targetStageId: string) => {
      onMergeStage?.(stage.id, targetStageId);
    },
    [stage.id, onMergeStage]
  );

  const handleFieldsChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      const selected = Array.from(e.target.selectedOptions, (o) => o.value);
      const fieldIds = selected.length > 0 ? selected : undefined;
      if (onUpdateStageFields) {
        onUpdateStageFields(stage.id, fieldIds);
      } else {
        onUpdate(stage.id, { fieldIds });
      }
    },
    [stage.id, onUpdate, onUpdateStageFields]
  );

  const canAcceptDrop = !readOnly && (!!onMoveGame || !!onMoveGameField);

  // True when the drag's origin is THIS exact card (same stage AND same
  // field-instance) -- the only case a drop here would be a no-op.
  const isOwnDropTarget = useCallback(
    () =>
      getDraggedGameSourceStageId() === stage.id &&
      getDraggedGameSourceFieldId() === fieldContext.id,
    [stage.id, fieldContext.id]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      if (isOwnDropTarget()) return;
      e.preventDefault();
      setIsDragOver(true);
    },
    [canAcceptDrop, isOwnDropTarget]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canAcceptDrop) return;
      if (isOwnDropTarget()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [canAcceptDrop, isOwnDropTarget]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      if (!canAcceptDrop) return;
      const gameId = e.dataTransfer.getData('text/plain');
      if (!gameId) return;
      const game = allNodes.find((n) => isGameNode(n) && n.id === gameId);
      if (!game) return;

      if (game.parentId === stage.id) {
        // Same stage: dropping onto a different field-instance card just
        // reassigns where it's played, never its stage/standings. A no-op
        // when the game is already on this field (e.g. dropped back onto
        // its own single-field stage card).
        const resolvedFieldId = (game as GameNode).data.fieldId || stage.parentId;
        if (resolvedFieldId === fieldContext.id || !onMoveGameField) return;
        e.preventDefault();
        onMoveGameField(gameId, fieldContext.id);
        return;
      }

      if (!onMoveGame) return;
      e.preventDefault();
      onMoveGame(gameId, stage.id, fieldContext.id === stage.parentId ? undefined : fieldContext.id);
    },
    [canAcceptDrop, onMoveGame, onMoveGameField, allNodes, stage.id, stage.parentId, fieldContext.id]
  );

  return (
    <Card
      id={`stage-${stage.id}`}
      data-testid={`stage-drop-target-${stage.id}`}
      title={canAcceptDrop ? t('ui:tooltip.dropToMove') : undefined}
      className={`stage-section mb-2 ${isHighlighted ? 'element-highlighted' : ''} ${isDragOver ? 'stage-drop-target' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Card.Header
        className={`stage-section__header d-flex align-items-center ${isEditing ? 'stage-section__header--editing' : ''}`}
        onClick={handleToggleExpand}
        style={{
          cursor: 'pointer',
          borderLeft: `3px solid ${stage.data.color || '#0d6efd'}`,
        }}
      >
        <i className={`bi ${isExpanded ? ICONS.EXPANDED : ICONS.COLLAPSED} me-2`}></i>

        <div className="d-flex align-items-center gap-2 me-3">
          <Form.Label htmlFor={`stage-start-${stage.id}`} className="mb-0 text-muted small">{t('ui:label.start')}:</Form.Label>
          <Form.Control
            id={`stage-start-${stage.id}`}
            type="time"
            size="sm"
            value={stage.data.startTime || ''}
            onChange={handleTimeChange}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '110px' }}
            disabled={readOnly || swissLocked}
            title={swissLocked ? t('ui:swiss.roundTimeLocked') : undefined}
          />
          {swissLocked && (
            <span
              className="text-muted small"
              data-testid={`swiss-round-time-hint-${stage.id}`}
              title={t('ui:swiss.roundTimeLocked')}
            >
              {t('ui:swiss.roundTimeLocked')}
            </span>
          )}
        </div>

        {isEditing ? (
          <div 
            ref={editZoneRef} 
            className="flex-grow-1 d-flex align-items-center gap-2"
            onBlur={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center gap-2 me-2">
              <Form.Label htmlFor={`stage-type-${stage.id}`} className="mb-0 text-muted small">{t('ui:label.type')}:</Form.Label>
              <Form.Select
                id={`stage-type-${stage.id}`}
                size="sm"
                value={editedStageType}
                onChange={(e) => setEditedStageType(e.target.value as 'STANDARD' | 'RANKING')}
                style={{ width: '140px' }}
              >
                <option value="STANDARD">{t('domain:stageTypeStandard')}</option>
                <option value="RANKING">{t('domain:stageTypeRanking')}</option>
              </Form.Select>
            </div>
            {allFields.length > 1 && (
              <div className="d-flex align-items-center gap-2 me-2">
                <Form.Label htmlFor={`stage-fields-${stage.id}`} className="mb-0 text-muted small">
                  {t('ui:label.fields', 'Fields')}:
                </Form.Label>
                <Form.Select
                  id={`stage-fields-${stage.id}`}
                  size="sm"
                  multiple
                  value={stageFieldIds}
                  onChange={handleFieldsChange}
                  title={t('ui:hint.multiFieldStage', 'Select multiple fields to spread this stage\'s games across them')}
                  style={{ width: '160px', minHeight: '60px' }}
                >
                  {allFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.data.name}</option>
                  ))}
                </Form.Select>
              </div>
            )}
            <div className="flex-grow-1 d-flex align-items-center gap-2">
              <input
                type="text"
                className="form-control form-control-sm"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyPress}
                autoFocus
                style={{ maxWidth: '300px' }}
              />
              <Button 
                size="sm" 
                variant="outline-success" 
                onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                className="p-1"
                title={t('ui:button.save')}
              >
                <i className="bi bi-check-lg"></i>
              </Button>
              <Button 
                size="sm" 
                variant="outline-secondary" 
                onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                className="p-1"
                title={t('ui:button.cancel')}
              >
                <i className="bi bi-x-lg"></i>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="me-3 small text-muted">
              {stage.data.stageType === 'RANKING' ? (
                <span className="badge bg-info text-dark" style={{ fontSize: '0.85rem' }}>
                  <i className="bi bi-trophy-fill me-1"></i>
                  {t('domain:stageTypeRanking')}
                </span>
              ) : (
                <span className="badge bg-light text-dark border" style={{ fontSize: '0.85rem' }}>
                  {t('domain:stageTypeStandard')}
                </span>
              )}
            </div>
            <strong className="me-2">{stage.data.name}</strong>
            {stageFieldIds.length > 1 && (
              <span
                className="badge bg-light text-dark border me-2"
                style={{ fontSize: '0.8rem' }}
                title={t(
                  'ui:hint.multiFieldStageInstance',
                  'This stage also runs on: {{otherFields}} -- all games count toward one combined table',
                  { otherFields: otherFieldNames.join(', ') }
                )}
              >
                <i className="bi bi-grid-3x3-gap me-1"></i>
                {t('ui:label.fieldOfCount', '{{index}}/{{count}}', { index: fieldPosition, count: stageFieldIds.length })}
              </span>
            )}
            {!readOnly && (
              <Button 
                size="sm" 
                variant="link" 
                onClick={handleStartEdit} 
                aria-label={t('ui:tooltip.editStageName')} 
                className="p-0 me-auto" 
                style={{ fontSize: '0.875rem' }}
                title={t('ui:tooltip.editStageName')}
              >
                <i className={`bi ${ICONS.PENCIL_SMALL}`}></i>
              </Button>
            )}
            {readOnly && <span className="me-auto" />}
          </>
        )}

        {!readOnly && (
          <button
            className="btn btn-sm btn-outline-primary btn-adaptive me-2"
            onClick={handleAddGame}
            aria-label={t('ui:button.addGame')}
            title={t('ui:tooltip.addGame')}
            data-testid="add-game-button"
          >
            <i className={`bi ${ICONS.ADD} me-2`}></i>
            <span className="btn-label-adaptive">{t('ui:button.addGame')}</span>
          </button>
        )}

        {!readOnly && onMergeStage && (
          <Dropdown
            align="end"
            onClick={(e) => e.stopPropagation()}
            className="me-2"
            data-testid={`merge-stage-dropdown-${stage.id}`}
          >
            <Dropdown.Toggle
              variant="link"
              size="sm"
              className="p-0 text-muted"
              disabled={mergeTargets.length === 0}
              title={mergeTargets.length === 0 ? t('ui:message.noMergeTargets', 'No other stages to merge with') : t('ui:tooltip.mergeStage', 'Merge into another stage')}
              data-testid={`merge-stage-toggle-${stage.id}`}
            >
              <i className="bi bi-signpost-split"></i>
            </Dropdown.Toggle>
            {createPortal(
              <Dropdown.Menu>
                {mergeTargets.map((entry) => (
                  <React.Fragment key={entry.field.id}>
                    <Dropdown.Header>{entry.field.data.name}</Dropdown.Header>
                    {entry.stages.map((targetStage) => (
                      <Dropdown.Item
                        key={targetStage.id}
                        data-testid={`merge-stage-target-${targetStage.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeStage(targetStage.id);
                        }}
                      >
                        {targetStage.data.name}
                      </Dropdown.Item>
                    ))}
                  </React.Fragment>
                ))}
              </Dropdown.Menu>,
              document.body
            )}
          </Dropdown>
        )}
        <input
          type="color"
          value={stage.data.color || '#e7f3ff'}
          onChange={handleColorChange}
          onClick={(e) => e.stopPropagation()}
          title={t('ui:tooltip.stageColor')}
          className="me-2"
          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '50%', cursor: 'pointer' }}
          disabled={readOnly}
        />

        {!readOnly && (
          <Button
            variant="outline-danger"
            size="sm"
            onClick={handleDelete}
            aria-label={t('ui:tooltip.deleteStage')}
            title={t('ui:tooltip.deleteStage')}
          >
            <i className={`bi ${ICONS.DELETE}`}></i>
          </Button>
        )}
      </Card.Header>

      {isExpanded && (
        <Card.Body className="stage-section__body">
          <div>
            <h6 className="text-uppercase text-muted mb-2">{t('domain:games')}</h6>
            {games.length === 0 ? (
              <div className="text-center py-3">
                <i className={`bi ${ICONS.TOURNAMENT} me-2`} style={{ fontSize: '2rem', opacity: 0.3 }}></i>
                <p className="text-muted mb-3">{t('ui:message.noGamesInStage')}</p>
                {!readOnly && (
                  <button 
                    className="btn btn-outline-primary btn-adaptive px-4"
                    onClick={handleAddGame} 
                    aria-label={t('ui:button.addGame')} 
                    title={t('ui:tooltip.addGame')}
                  >
                    <i className={`bi ${ICONS.ADD} me-2`} />
                    <span className="btn-label-adaptive">{t('ui:button.addGame')}</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <GameTable
                  games={games}
                  edges={edges}
                  allNodes={allNodes}
                  currentFieldId={fieldContext.id}
                  otherStageFields={stageFieldIds.length > 1 ? allFields.filter((f) => stageFieldIds.includes(f.id) && f.id !== fieldContext.id) : undefined}
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
                  onAddGameToGameEdge={onAddGameToGameEdge}
                   onAddStageToGameEdge={onAddStageToGameEdge}
                  onRemoveEdgeFromSlot={onRemoveEdgeFromSlot}
                  onOpenResultModal={onOpenResultModal}
                  highlightedSourceGameId={highlightedSourceGameId}

                  onDynamicReferenceClick={onDynamicReferenceClick}
                  onNotify={onNotify}
                  onMoveGame={onMoveGame}
                  onMoveGameField={onMoveGameField}
                  readOnly={readOnly}
                  expertMode={expertMode}
                  progressionByGameId={progressionByGameId}
                  multiDayEnabled={multiDayEnabled}
                  lockTimeEdits={swissLocked}
                />
              </>
            )}
          </div>
        </Card.Body>
      )}
    </Card>
  );
});

export default StageSection;