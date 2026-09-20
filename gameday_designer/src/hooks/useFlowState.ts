import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import i18n from '../i18n/config';
import type {
  FlowNode,
  FlowEdge,
  FlowState,
  GameNodeData,
  TeamNodeData,
  FieldNodeData,
  StageNodeData,
  FieldNode,
  StageNode,
  GameNode,
  SelectionState,
  GlobalTeam,
  GlobalTeamGroup,
  GamedayMetadata,
  GameInputHandle,
  GameOutputHandle,
  SwissTournamentState,
} from '../types/flowchart';
import type { TeamReference } from '../types/designer';
import {
  createGameNode,
  isGameNode,
  isFieldNode,
  isStageNode,
  getFieldNodes,
  getStageFieldIds,
} from '../types/flowchart';
import { useNodesState, recalcStageTimes } from './useNodesState';
import { DEFAULT_GAME_DURATION } from '../utils/tournamentConstants';
import { useEdgesState } from './useEdgesState';
import { useTeamPoolState } from './useTeamPoolState';
import { resolveBracketReferences } from '../utils/bracketResolution';

/**
 * Calculate a position for a new node.
 */
function calculateNewNodePosition(
  existingNodes: FlowNode[],
  nodeType: 'team' | 'game'
): { x: number; y: number } {
  // Default starting positions
  const baseX = nodeType === 'team' ? 50 : 300;
  const baseY = 50;
  const offsetY = 150;

  // Count existing nodes of same type
  const sameTypeNodes = existingNodes.filter((n) =>
    nodeType === 'game' ? isGameNode(n) : false
  );

  return {
    x: baseX,
    y: baseY + sameTypeNodes.length * offsetY,
  };
}

/**
 * Return type for the useFlowState hook.
 */
export type UseFlowStateReturn = ReturnType<typeof useFlowStateInternal>;

/**
 * useFlowState hook.
 *
 * Orchestrates specialized hooks for managing the complete state of the flowchart designer.
 */
export function useFlowState(initialState?: Partial<FlowState>, onStateChange?: () => void): UseFlowStateReturn {
  return useFlowStateInternal(initialState, onStateChange);
}

function useFlowStateInternal(initialState?: Partial<FlowState>, onStateChange?: () => void) {
  // --- Core State ---
  const [saveTrigger, setSaveTrigger] = useState(0);

  const [metadata, setMetadata] = useState<GamedayMetadata>(initialState?.metadata ? {
    ...initialState.metadata,
    date: initialState.metadata.date || ''
  } : {
    id: 0,
    name: '',
    date: '',
    start: '10:00',
    format: '6_2',
    author: 0,
    address: '',
    season: 0,
    league: 0,
    status: 'DRAFT',
  });

  const [nodes, setNodes] = useState<FlowNode[]>(initialState?.nodes ?? []);
  const [edges, setEdges] = useState<FlowEdge[]>(initialState?.edges ?? []);
  const [globalTeams, setGlobalTeams] = useState<GlobalTeam[]>(initialState?.globalTeams ?? []);
  const [globalTeamGroups, setGlobalTeamGroups] = useState<GlobalTeamGroup[]>(initialState?.globalTeamGroups ?? []);
  // Swiss-system tournament config (#1970): client-opaque, round-tripped
  // untouched so designer saves never wipe the organizer's tournament.
  const [swiss, setSwiss] = useState<SwissTournamentState | undefined>(initialState?.swiss);
  const [selection, setSelection] = useState<SelectionState>({ nodeIds: [], edgeIds: [] });
  const hasInitializedOfficials = useRef(false);

  // --- History Management ---
  const historyRef = useRef<FlowState[]>([]);
  const currentIndexRef = useRef(-1);
  const isInternalUpdateRef = useRef(false);
  
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const captureHistory = useCallback((state: FlowState) => {
    if (isInternalUpdateRef.current) return;

    const lastState = historyRef.current[currentIndexRef.current];
    if (lastState && JSON.stringify(lastState) === JSON.stringify(state)) return;

    // Truncate future if we are in the middle of history
    const newHistory = historyRef.current.slice(0, currentIndexRef.current + 1);
    newHistory.push(JSON.parse(JSON.stringify(state)));

    // Limit history size
    if (newHistory.length > 50) newHistory.shift();

    historyRef.current = newHistory;
    currentIndexRef.current = newHistory.length - 1;
    
    setCanUndo(currentIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  // Capture history whenever state changes externally
  useEffect(() => {
    if (!isInternalUpdateRef.current) {
      captureHistory({ metadata, nodes, edges, globalTeams, globalTeamGroups });
    }
  }, [metadata, nodes, edges, globalTeams, globalTeamGroups, captureHistory]);

  const handleStateChange = useCallback(() => {
    setSaveTrigger(prev => prev + 1);
    onStateChange?.();
  }, [onStateChange]);

  // --- Bracket Resolution ---
  useEffect(() => {
    if (isInternalUpdateRef.current) return;

    const resolvedNodes = resolveBracketReferences(nodes, globalTeams);
    if (resolvedNodes !== nodes) {
      isInternalUpdateRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNodes(resolvedNodes);
      setTimeout(() => { isInternalUpdateRef.current = false; }, 0);
    }
  }, [nodes, globalTeams]);

  const undo = useCallback(() => {
    if (currentIndexRef.current <= 0) return;

    isInternalUpdateRef.current = true;
    currentIndexRef.current--;
    const prevState = historyRef.current[currentIndexRef.current];

    setMetadata(prevState.metadata!);
    setNodes(prevState.nodes);
    setEdges(prevState.edges);
    setGlobalTeams(prevState.globalTeams);
    setGlobalTeamGroups(prevState.globalTeamGroups);
    
    setSaveTrigger(prev => prev + 1);
    onStateChange?.();
    
    setCanUndo(currentIndexRef.current > 0);
    setCanRedo(currentIndexRef.current < historyRef.current.length - 1);
    
    // Release lock after state updates are scheduled
    setTimeout(() => { isInternalUpdateRef.current = false; }, 0);
  }, [onStateChange]);

  const redo = useCallback(() => {
    if (currentIndexRef.current >= historyRef.current.length - 1) return;

    isInternalUpdateRef.current = true;
    currentIndexRef.current++;
    const nextState = historyRef.current[currentIndexRef.current];

    setMetadata(nextState.metadata!);
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    setGlobalTeams(nextState.globalTeams);
    setGlobalTeamGroups(nextState.globalTeamGroups);
    
    setSaveTrigger(prev => prev + 1);
    onStateChange?.();

    setCanUndo(currentIndexRef.current > 0);
    setCanRedo(currentIndexRef.current < historyRef.current.length - 1);

    setTimeout(() => { isInternalUpdateRef.current = false; }, 0);
  }, [onStateChange]);

  // --- Specialized Hooks ---
  const nodesManager = useNodesState(nodes, (newNodes) => {
    setNodes(newNodes);
    handleStateChange();
  }, undefined, metadata.game_duration ?? DEFAULT_GAME_DURATION);
  const edgesManager = useEdgesState(edges, (newEdges) => {
    setEdges(newEdges);
    handleStateChange();
  }, setNodes);
  const teamPoolManager = useTeamPoolState(
    globalTeams,
    (newTeams) => {
      setGlobalTeams(newTeams);
      handleStateChange();
    },
    globalTeamGroups,
    (newGroups) => {
      setGlobalTeamGroups(newGroups);
      handleStateChange();
    },
    nodes,
    setNodes
  );

  // --- Initialization ---

  const {
    addBulkGameToGameEdges,
    addStageToGameEdge,
    removeEdgeFromSlot,
    ...edgesManagerProps
  } = edgesManager;

  // --- Actions ---

  const updateMetadata = useCallback((data: Partial<GamedayMetadata>) => {
    setMetadata((prev) => ({ ...prev, ...data }));
    handleStateChange();
  }, [handleStateChange]);

  const onNodesChange = useCallback(() => {}, []);
  const onEdgesChange = useCallback(() => {}, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelection({ nodeIds: nodeId ? [nodeId] : [], edgeIds: [] });
  }, []);

  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setGlobalTeams([]);
    setGlobalTeamGroups([]);
    setSelection({ nodeIds: [], edgeIds: [] });
    // When clearing everything, we should also allow re-initialization of officials group if needed
    hasInitializedOfficials.current = false;
    handleStateChange();
  }, [handleStateChange]);

  const clearSchedule = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelection({ nodeIds: [], edgeIds: [] });
    handleStateChange();
  }, [handleStateChange]);

  const importState = useCallback((state: FlowState) => {
    const meta = state.metadata;
    if (meta) {
      setMetadata(prev => ({
        ...meta,
        date: meta.date || '',
        status: meta.status || prev.status || 'DRAFT'
      }));
    }
    setNodes(state.nodes || []);
    setEdges(state.edges || []);
    const migratedTeams = (state.globalTeams || []).map((team: GlobalTeam & { reference?: string }) => {
      const hasRef = 'reference' in team;
      const noGroup = !('groupId' in team);
      if (hasRef && noGroup) {
        return { 
          id: (team as GlobalTeam).id, 
          label: (team as GlobalTeam).label || 'Team', 
          groupId: null, 
          order: (team as GlobalTeam).order ?? 0,
          color: (team as GlobalTeam).color ?? '#cccccc' 
        };
      }
      return team;
    });
    setGlobalTeams(migratedTeams);
    setGlobalTeamGroups(state.globalTeamGroups || []);
    setSwiss(state.swiss);
    setSelection({ nodeIds: [], edgeIds: [] });
    handleStateChange();
  }, [handleStateChange]);

  const exportState = useCallback((): FlowState => {
    return {
      metadata,
      nodes,
      edges,
      globalTeams,
      globalTeamGroups,
      swiss,
    };
  }, [metadata, nodes, edges, globalTeams, globalTeamGroups, swiss]);

  /**
   * Legacy addGameNode that doesn't enforce hierarchy.
   */
  const addGameNode = useCallback(
    (options?: Partial<Omit<GameNodeData, 'type'>>): FlowNode => {
      const id = `game-${uuidv4()}`;
      const position = calculateNewNodePosition(nodes, 'game');
      const gameCount = nodes.filter(isGameNode).length;
      const standing = options?.standing ?? `Game ${gameCount + 1}`;
      const newNode = createGameNode(id, position, { ...options, standing });
      setNodes((nds) => [...nds, newNode]);
      onStateChange?.();
      return newNode;
    },
    [nodes, onStateChange]
  );

  /**
   * Orchestrated deleteNode that handles cascading and edge cleanup.
   */
  const deleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = nodes.find((n) => n.id === nodeId);
      if (!nodeToDelete) return;

      const nodeIdsToDelete = new Set<string>([nodeId]);
      if (isFieldNode(nodeToDelete)) {
        const stages = nodes.filter((n) => isStageNode(n) && n.parentId === nodeId);
        stages.forEach((stage) => {
          nodeIdsToDelete.add(stage.id);
          nodes.filter((n) => n.parentId === stage.id).forEach((child) => nodeIdsToDelete.add(child.id));
        });
      } else if (isStageNode(nodeToDelete)) {
        nodes.filter((n) => n.parentId === nodeId).forEach((child) => nodeIdsToDelete.add(child.id));
      }

      const deletedIds = Array.from(nodeIdsToDelete);
      
      // Atomic updates
      setNodes((nds) => {
        const remainingNodes = nds.filter((n) => !nodeIdsToDelete.has(n.id));
        // Also cleanup lost dynamic refs in remaining nodes
        return remainingNodes.map(node => {
          if (!isGameNode(node)) return node;
          const lostHome = edges.some(e => e.target === node.id && e.targetHandle === 'home' && deletedIds.includes(e.source));
          const lostAway = edges.some(e => e.target === node.id && e.targetHandle === 'away' && deletedIds.includes(e.source));
          if (!lostHome && !lostAway) return node;
          return {
            ...node,
            data: {
              ...node.data,
              ...(lostHome ? { homeTeamDynamic: null } : {}),
              ...(lostAway ? { awayTeamDynamic: null } : {})
            }
          };
        });
      });
      setEdges((eds) => eds.filter((e) => !deletedIds.includes(e.source) && !deletedIds.includes(e.target)));
      setSelection((sel) => ({
        nodeIds: sel.nodeIds.filter((id) => !deletedIds.includes(id)),
        edgeIds: sel.edgeIds.filter((id) => !deletedIds.includes(id)),
      }));
      onStateChange?.();
    },
    [nodes, edges, onStateChange]
  );

  /**
   * Merges `sourceStageId` into `targetStageId`: re-parents the source
   * stage's games (preserving each one's actual field, exactly like
   * `moveNodeToStage`), unions `fieldIds` onto the target, deletes the
   * source node, and repoints every `rank`/`groupRank` reference
   * (`homeTeamDynamic`/`awayTeamDynamic`/`official`) that targeted the
   * source stage at the target instead. The target's own name and
   * `stageType` always win -- the source contributes only its games and
   * fields.
   *
   * Deliberately does NOT call `useEdgesState`'s `syncNodesWithEdges`:
   * that helper unconditionally nulls out any game's `homeTeamDynamic`/
   * `awayTeamDynamic` that has no backing `stageToGame` edge, but
   * `templateMapper.ts`'s legacy-import path writes those fields directly
   * with no edge at all -- calling it here would silently wipe references
   * on any gameday imported that way. Rewriting the reference fields in
   * place (below) handles both edge-backed and edge-less references
   * uniformly and non-destructively; the `stageToGame` edges themselves
   * are still remapped separately so the edge graph stays consistent for
   * any *later* edge-driven operation.
   */
  const mergeStageInto = useCallback(
    (sourceStageId: string, targetStageId: string): boolean => {
      if (sourceStageId === targetStageId) return false;
      const sourceStage = nodes.find((n): n is StageNode => n.id === sourceStageId && isStageNode(n));
      const targetStage = nodes.find((n): n is StageNode => n.id === targetStageId && isStageNode(n));
      if (!sourceStage || !targetStage) return false;

      const mergedFieldIds = Array.from(
        new Set([...getStageFieldIds(targetStage), ...getStageFieldIds(sourceStage)])
      );

      const remapRef = <T extends TeamReference | null>(ref: T): T => {
        if (ref && (ref.type === 'rank' || ref.type === 'groupRank') && ref.stageId === sourceStageId) {
          return { ...ref, stageId: targetStageId, stageName: targetStage.data.name };
        }
        return ref;
      };

      const nodesAfterMerge = nodes
        .map((n): FlowNode => {
          if (n.id === targetStageId && isStageNode(n)) {
            return {
              ...n,
              data: { ...n.data, fieldIds: mergedFieldIds.length > 1 ? mergedFieldIds : undefined },
            } as FlowNode;
          }
          if (isGameNode(n) && n.parentId === sourceStageId) {
            const resolvedFieldId = n.data.fieldId || sourceStage.parentId;
            const newFieldId = resolvedFieldId === targetStage.parentId ? null : resolvedFieldId;
            return {
              ...n,
              parentId: targetStageId,
              data: {
                ...n.data,
                stage: targetStage.data.name,
                stageType: targetStage.data.stageType,
                fieldId: newFieldId,
                homeTeamDynamic: remapRef(n.data.homeTeamDynamic),
                awayTeamDynamic: remapRef(n.data.awayTeamDynamic),
                official: remapRef(n.data.official),
              },
            } as FlowNode;
          }
          if (isGameNode(n)) {
            const homeTeamDynamic = remapRef(n.data.homeTeamDynamic);
            const awayTeamDynamic = remapRef(n.data.awayTeamDynamic);
            const official = remapRef(n.data.official);
            if (
              homeTeamDynamic === n.data.homeTeamDynamic &&
              awayTeamDynamic === n.data.awayTeamDynamic &&
              official === n.data.official
            ) {
              return n;
            }
            return { ...n, data: { ...n.data, homeTeamDynamic, awayTeamDynamic, official } } as FlowNode;
          }
          return n;
        })
        .filter((n) => n.id !== sourceStageId);

      const finalNodes = recalcStageTimes(nodesAfterMerge, targetStageId);

      setNodes(finalNodes);
      setEdges((eds) =>
        eds.map((e): FlowEdge =>
          e.type === 'stageToGame' && e.source === sourceStageId ? { ...e, source: targetStageId } : e
        )
      );
      setSelection((sel) => ({
        nodeIds: sel.nodeIds.map((id) => (id === sourceStageId ? targetStageId : id)),
        edgeIds: sel.edgeIds,
      }));
      onStateChange?.();
      return true;
    },
    [nodes, onStateChange]
  );

  /**
   * Orchestrated updateNode: a plain passthrough to `nodesManager.updateNode`
   * for everything, EXCEPT renaming a Stage to a name that (trimmed,
   * case-insensitively) collides with a different existing stage -- stage
   * name is that stage's identity (see `mergeStageInto` above), so a
   * colliding rename merges into the existing stage instead of creating a
   * same-named duplicate. The existing stage's own name and type always
   * win; any other fields in this same update (e.g. a simultaneous
   * `stageType` change) are discarded along with the rest of the merged-away
   * node, matching how the rest of that node's data is folded away too.
   */
  const updateNode = useCallback(
    (nodeId: string, data: Partial<TeamNodeData | GameNodeData | FieldNodeData | StageNodeData>) => {
      const node = nodes.find((n) => n.id === nodeId);
      const newName = 'name' in data ? (data as Partial<StageNodeData>).name : undefined;
      if (node && isStageNode(node) && typeof newName === 'string') {
        const trimmed = newName.trim();
        if (trimmed && trimmed.toLowerCase() !== node.data.name.trim().toLowerCase()) {
          const collision = nodes.find(
            (n): n is StageNode =>
              isStageNode(n) && n.id !== nodeId && n.data.name.trim().toLowerCase() === trimmed.toLowerCase()
          );
          if (collision) {
            mergeStageInto(nodeId, collision.id);
            return;
          }
        }
      }
      nodesManager.updateNode(nodeId, data);
    },
    [nodes, nodesManager, mergeStageInto]
  );

  // --- Hierarchy Helpers ---

  const getTargetStage = useCallback((): StageNode | null => {
    return nodesManager.getTargetStage(selection.nodeIds[0] || null);
  }, [nodesManager, selection.nodeIds]);

  const ensureContainerHierarchy = useCallback((): { fieldId: string; stageId: string } => {
    return nodesManager.ensureContainerHierarchy(selection.nodeIds[0] || null);
  }, [nodesManager, selection.nodeIds]);

  const getGameField = useCallback((gameId: string): FieldNode | null => {
    const game = nodes.find((n) => n.id === gameId && isGameNode(n)) as GameNode | undefined;
    if (!game) return null;
    // A game normally plays on its stage's home field, but a stage spanning
    // multiple fields (StageNodeData.fieldIds) lets each game pick its
    // actual field individually via GameNodeData.fieldId.
    const resolvedFieldId = game.data.fieldId
      ?? (nodes.find((n) => n.id === game.parentId && isStageNode(n)) as StageNode | undefined)?.parentId;
    if (!resolvedFieldId) return null;
    return nodes.find((n) => n.id === resolvedFieldId && isFieldNode(n)) as FieldNode || null;
  }, [nodes]);

  const getGameStage = useCallback((gameId: string): StageNode | null => {
    const game = nodes.find((n) => n.id === gameId && isGameNode(n));
    if (!game?.parentId) return null;
    return nodes.find((n) => n.id === game.parentId && isStageNode(n)) as StageNode || null;
  }, [nodes]);

  const stats = useMemo(() => ({
    fieldCount: getFieldNodes(nodes).length,
    gameCount: nodes.filter(isGameNode).length,
    teamCount: globalTeams.filter(t => t.groupId !== 'group-officials').length,
  }), [nodes, globalTeams]);

  const getFieldStages = useCallback((fieldId: string) => 
    nodes.filter((n) => isStageNode(n) && n.parentId === fieldId) as StageNode[], 
  [nodes]);

  const getStageGames = useCallback((stageId: string) => 
    nodes.filter((n) => isGameNode(n) && n.parentId === stageId) as GameNode[], 
  [nodes]);

  const matchNames = useMemo(() => nodes.filter(isGameNode).map((n) => n.data.standing).filter(Boolean), [nodes]);
  const groupNames = useMemo(() => ['Gruppe 1', 'Gruppe 2', 'Gruppe A', 'Gruppe B'], []);

  const addBulkGames = useCallback((games: FlowNode[]) => {
    setNodes((nds) => [...nds, ...games]);
    onStateChange?.();
  }, [onStateChange]);

  const addBulkGamesToGameEdgesCb = useCallback((newEdges: Array<{ sourceGameId: string; outputType: GameOutputHandle; targetGameId: string; targetSlot: GameInputHandle }>, clearExisting?: boolean) => {
    addBulkGameToGameEdges(newEdges, clearExisting);
  }, [addBulkGameToGameEdges]);

  const addStageToGameEdgeCb = useCallback((sourceStageId: string, sourceRank: number, targetGameId: string, targetPort: 'home' | 'away', sourceGroup?: string) => {
    addStageToGameEdge(sourceStageId, sourceRank, targetGameId, targetPort, sourceGroup);
  }, [addStageToGameEdge]);

  const removeEdgeFromSlotCb = useCallback((targetNodeId: string, targetHandle: 'home' | 'away') => {
    removeEdgeFromSlot(targetNodeId, targetHandle);
  }, [removeEdgeFromSlot]);

  const addOfficialsGroup = useCallback(() => {
    teamPoolManager.ensureOfficialsGroup(i18n.t('ui:label.externalOfficials'));
  }, [teamPoolManager]);

  return useMemo(() => ({
    metadata,
    nodes,
    edges,
    globalTeams,
    globalTeamGroups,
    saveTrigger,
    undo,
    redo,
    canUndo,
    canRedo,
    stats,
    selectedNode: nodes.find((n) => n.id === selection.nodeIds[0]) || null,
    selection,
    onNodesChange,
    onEdgesChange,
    ...nodesManager,
    ...edgesManagerProps,
    ...teamPoolManager,
    addBulkGameToGameEdges: addBulkGamesToGameEdgesCb,
    addStageToGameEdge: addStageToGameEdgeCb,
    removeEdgeFromSlot: removeEdgeFromSlotCb,
    addOfficialsGroup,
    addGameNode, // Overrides nodesManager.addGameNode (v1 behavior)
    deleteNode, // Overrides managers
    mergeStageInto,
    selectNode,
    updateMetadata,
    setSelection,
    clearAll,
    clearSchedule,
    importState,
    exportState,
    swiss,
    setSwiss,
    getTargetStage,
    ensureContainerHierarchy,
    getGameField,
    getGameStage,
    getTeamField: () => null, // Placeholder
    getTeamStage: () => null, // Placeholder
    getFieldStages,
    getStageGames,
    selectedContainerField: nodes.find((n) => n.id === selection.nodeIds[0] && isFieldNode(n)) as FieldNode || null,
    selectedContainerStage: nodes.find((n) => n.id === selection.nodeIds[0] && isStageNode(n)) as StageNode || null,
    setEdges,
    matchNames,
    groupNames,
    addBulkGames,
    // Explicitly export these from managers
    addFieldNode: nodesManager.addFieldNode,
    addStageNode: nodesManager.addStageNode,
    addBulkTournament: nodesManager.addBulkTournament,
    addGlobalTeam: teamPoolManager.addGlobalTeam,
    updateGlobalTeam: teamPoolManager.updateGlobalTeam,
    deleteGlobalTeam: teamPoolManager.deleteGlobalTeam,
    reorderGlobalTeam: teamPoolManager.reorderGlobalTeam,
    addGlobalTeamGroup: teamPoolManager.addGlobalTeamGroup,
    assignTeamToGame: teamPoolManager.assignTeamToGame,
    ensureOfficialsGroup: teamPoolManager.ensureOfficialsGroup,
    updateNode, // Overrides nodesManager.updateNode -- see the stage-merge-on-rename note above
  }), [
    metadata, nodes, edges, globalTeams, globalTeamGroups, saveTrigger,
    undo, redo, canUndo, canRedo, stats, selection, onNodesChange, onEdgesChange,
    nodesManager, edgesManagerProps, teamPoolManager, addBulkGamesToGameEdgesCb,
    addStageToGameEdgeCb, removeEdgeFromSlotCb, addOfficialsGroup, addGameNode, deleteNode,
    mergeStageInto, updateNode, selectNode, updateMetadata,
    setSelection, clearAll, clearSchedule, importState, exportState, swiss, setSwiss,
    getTargetStage, ensureContainerHierarchy, getGameField, getGameStage,
    getFieldStages, getStageGames, matchNames, groupNames, addBulkGames
  ]);
}
