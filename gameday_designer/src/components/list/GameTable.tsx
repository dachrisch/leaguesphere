/**
 * GameTable Component
 *
 * Displays games in a stage as a table.
 * Shows team assignments via dropdown selectors or dynamic refs from edges.
 * Features inline editing for standing and breakAfter fields.
 */

import React, { useState, useCallback } from 'react';
import { Table, Form } from 'react-bootstrap';
import Select, { components, StylesConfig, GroupBase } from 'react-select';
import type { GameNode, FlowEdge, FlowNode, GlobalTeam, GameNodeData } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';
import { findSourceGameForReference, getGamePath } from '../../utils/edgeAnalysis';
import './GameTable.css';

// Type for select options
interface TeamOption {
  value: string;
  label: string;
  color?: string;
  isTeam?: boolean;
  isStageHeader?: boolean;
  isDisabled?: boolean;
}

// Custom Option component with colored dot for teams and stage headers
const CustomOption = (props: any) => {
  const { data } = props;

  // Stage header - disabled separator with colored border
  if (data.isStageHeader) {
    return (
      <components.Option {...props} isDisabled={true}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 'bold',
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            color: '#6c757d',
            borderLeft: `3px solid ${data.color || '#dee2e6'}`,
            paddingLeft: '8px',
            marginLeft: '-12px',
            paddingTop: '4px',
            paddingBottom: '4px',
            backgroundColor: '#f8f9fa'
          }}
        >
          <span>{data.label}</span>
        </div>
      </components.Option>
    );
  }

  // Regular option (team or dynamic reference)
  return (
    <components.Option {...props}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {data.color && (
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: data.color,
              flexShrink: 0
            }}
          />
        )}
        <span>{data.label}</span>
      </div>
    </components.Option>
  );
};

// Custom SingleValue component with colored dot for selected value
const CustomSingleValue = (props: any) => {
  const { data } = props;
  return (
    <components.SingleValue {...props}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {data.color && (
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: data.color,
              flexShrink: 0
            }}
          />
        )}
        <span>{data.label}</span>
      </div>
    </components.SingleValue>
  );
};

// Custom styles for react-select to match Bootstrap form controls
const customSelectStyles: StylesConfig<TeamOption, false, GroupBase<TeamOption>> = {
  control: (provided) => ({
    ...provided,
    minHeight: '31px',
    fontSize: '0.875rem',
    borderColor: '#dee2e6'
  }),
  option: (provided) => ({
    ...provided,
    fontSize: '0.875rem',
    padding: '6px 12px'
  }),
  singleValue: (provided) => ({
    ...provided,
    fontSize: '0.875rem'
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 9999
  }),
  menuPortal: (provided) => ({
    ...provided,
    zIndex: 9999
  })
};

export interface GameTableProps {
  games: GameNode[];
  edges: FlowEdge[];
  allNodes: FlowNode[];
  globalTeams: GlobalTeam[];
  onUpdate: (nodeId: string, data: Partial<GameNode['data']>) => void;
  onDelete: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  onAssignTeam: (gameId: string, teamId: string, slot: 'home' | 'away') => void;
  onAddGameToGameEdge: (sourceGameId: string, outputType: 'winner' | 'loser', targetGameId: string, targetSlot: 'home' | 'away') => void;
  onRemoveGameToGameEdge: (targetGameId: string, targetSlot: 'home' | 'away') => void;
}

const GameTable: React.FC<GameTableProps> = ({
  games,
  edges,
  allNodes,
  globalTeams,
  onDelete,
  onSelectNode,
  selectedNodeId,
  onAssignTeam,
  onUpdate,
  onAddGameToGameEdge,
  onRemoveGameToGameEdge,
}) => {
  // State for inline editing
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'standing' | 'breakAfter' | null>(null);
  const [editedValue, setEditedValue] = useState<string>('');

  const handleRowClick = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent bubbling to parent containers
    onSelectNode(gameId);
  };

  const handleDelete = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent row selection
    onDelete(gameId);
  };

  /**
   * Start editing a field.
   */
  const handleStartEdit = useCallback(
    (e: React.MouseEvent, game: GameNode, field: 'standing' | 'breakAfter') => {
      e.stopPropagation();
      setEditingGameId(game.id);
      setEditingField(field);
      setEditedValue(
        field === 'standing' ? game.data.standing : String(game.data.breakAfter || 0)
      );
    },
    []
  );

  /**
   * Save edited value.
   */
  const handleSaveEdit = useCallback(
    (gameId: string, field: 'standing' | 'breakAfter') => {
      if (editedValue.trim() !== '') {
        if (field === 'standing') {
          onUpdate(gameId, { standing: editedValue.trim() });
        } else {
          const numValue = parseInt(editedValue, 10);
          if (!isNaN(numValue) && numValue >= 0) {
            onUpdate(gameId, { breakAfter: numValue });
          }
        }
      }
      setEditingGameId(null);
      setEditingField(null);
    },
    [editedValue, onUpdate]
  );

  /**
   * Cancel editing.
   */
  const handleCancelEdit = useCallback(() => {
    setEditingGameId(null);
    setEditingField(null);
  }, []);

  /**
   * Handle key press during editing.
   */
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, gameId: string, field: 'standing' | 'breakAfter') => {
      if (e.key === 'Enter') {
        handleSaveEdit(gameId, field);
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  /**
   * Get eligible source games for dynamic references.
   * Only include games from stages with lower order.
   */
  const getEligibleSourceGames = (targetGame: GameNode): GameNode[] => {
    const targetPath = getGamePath(targetGame.id, allNodes);
    if (!targetPath) return [];

    const targetStageOrder = targetPath.stage.data.order;

    return allNodes
      .filter((node): node is GameNode => {
        if (!isGameNode(node)) return false;
        if (node.id === targetGame.id) return false;

        const path = getGamePath(node.id, allNodes);
        if (!path) return false;

        // Only show games from earlier stages (lower order)
        return path.stage.data.order < targetStageOrder;
      })
      .sort((a, b) => {
        const pathA = getGamePath(a.id, allNodes)!;
        const pathB = getGamePath(b.id, allNodes)!;
        return pathA.stage.data.order - pathB.stage.data.order;
      });
  };

  /**
   * Handle team/reference selection from dropdown.
   */
  const handleTeamChange = (gameId: string, slot: 'home' | 'away', value: string) => {
    if (!value) {
      // Clear selection
      onRemoveGameToGameEdge(gameId, slot);
      return;
    }

    if (value.startsWith('winner:') || value.startsWith('loser:')) {
      // Dynamic reference selected
      const [outputType, sourceGameId] = value.split(':');
      onAddGameToGameEdge(sourceGameId, outputType as 'winner' | 'loser', gameId, slot);
    } else {
      // Static team selected
      onRemoveGameToGameEdge(gameId, slot);
      onAssignTeam(gameId, value, slot);
    }
  };

  /**
   * Handle official selection change.
   */
  const handleOfficialChange = useCallback(
    (gameId: string, value: string) => {
      if (!value) {
        // Clear official
        onUpdate(gameId, { official: undefined });
        return;
      }

      // Update official with the selected value (static team or dynamic reference)
      onUpdate(gameId, { official: value });
    },
    [onUpdate]
  );

  /**
   * Render official selector (checkbox + dropdown).
   */
  const renderOfficialCell = (game: GameNode) => {
    const official = game.data.official;
    const hasOfficial = !!official;
    const eligibleGames = getEligibleSourceGames(game);

    // Group eligible games by stage
    const gamesByStage = new Map<string, { name: string; games: GameNode[] }>();
    eligibleGames.forEach((sourceGame) => {
      const sourcePath = getGamePath(sourceGame.id, allNodes);
      const stageId = sourcePath?.stage.id || '';
      const stageName = sourcePath?.stage.data.name || '';
      if (!gamesByStage.has(stageId)) {
        gamesByStage.set(stageId, { name: stageName, games: [] });
      }
      gamesByStage.get(stageId)!.games.push(sourceGame);
    });

    // Build options array
    const options: TeamOption[] = [];

    // Add static teams with colors
    globalTeams.forEach((team) => {
      options.push({
        value: team.id,
        label: team.label,
        color: team.color || '#6c757d',
        isTeam: true
      });
    });

    // Add dynamic references grouped by stage
    Array.from(gamesByStage.entries()).forEach(([stageId, stageData]) => {
      // Find stage node to get color
      const stageNode = allNodes.find(n => n.id === stageId);
      const stageColor = stageNode && 'color' in stageNode.data ? stageNode.data.color : '#0d6efd';

      // Add stage header separator
      options.push({
        value: `stage-header-${stageId}`,
        label: stageData.name,
        color: stageColor,
        isStageHeader: true,
        isDisabled: true
      });

      // Add winner/loser options for games in this stage
      stageData.games.forEach((sourceGame) => {
        options.push({
          value: `winner:${sourceGame.id}`,
          label: `⚡ Winner of ${sourceGame.data.standing}`,
          isTeam: false
        });
        options.push({
          value: `loser:${sourceGame.id}`,
          label: `💔 Loser of ${sourceGame.data.standing}`,
          isTeam: false
        });
      });
    });

    // Find selected option
    const selectedOption = options.find(opt => opt.value === official) || null;

    return (
      <div className="d-flex align-items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Checkbox to enable/disable official */}
        <Form.Check
          type="checkbox"
          checked={hasOfficial}
          onChange={(e) => {
            if (!e.target.checked) {
              // Disable official
              handleOfficialChange(game.id, '');
            } else {
              // Enable with first team if available
              if (globalTeams.length > 0) {
                handleOfficialChange(game.id, globalTeams[0].id);
              }
            }
          }}
          style={{ margin: 0 }}
        />

        {/* Dropdown selector (only shown when enabled) */}
        {hasOfficial && (
          <Select<TeamOption>
            value={selectedOption}
            options={options}
            onChange={(newValue) => {
              if (newValue) {
                handleOfficialChange(game.id, newValue.value);
              }
            }}
            components={{
              Option: CustomOption,
              SingleValue: CustomSingleValue
            }}
            isOptionDisabled={(option) => option.isDisabled || false}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{
              ...customSelectStyles,
              control: (provided) => ({
                ...provided,
                minHeight: '31px',
                fontSize: '0.875rem',
                borderColor: '#dee2e6',
                minWidth: '150px'
              })
            }}
            isClearable={false}
            isSearchable={false}
          />
        )}
      </div>
    );
  };

  // Render team cell as a simple dropdown (like officials)
  const renderTeamCell = (game: GameNode, slot: 'home' | 'away') => {
    const data = game.data as GameNodeData;
    const dynamicRef = slot === 'home' ? data.homeTeamDynamic : data.awayTeamDynamic;
    const teamId = slot === 'home' ? data.homeTeamId : data.awayTeamId;
    const eligibleGames = getEligibleSourceGames(game);

    // Determine current value
    let currentValue = '';
    if (dynamicRef) {
      // Find the source game to get the output type
      const sourceGame = findSourceGameForReference(game.id, slot, edges, allNodes);
      if (sourceGame) {
        // Extract output type from dynamicRef.type (winner or loser)
        const outputType = dynamicRef.type === 'loser' ? 'loser' : 'winner';
        currentValue = `${outputType}:${sourceGame.id}`;
      }
    } else if (teamId) {
      currentValue = teamId;
    }

    // Group eligible games by stage
    const gamesByStage = new Map<string, { name: string; games: GameNode[] }>();
    eligibleGames.forEach((sourceGame) => {
      const sourcePath = getGamePath(sourceGame.id, allNodes);
      const stageId = sourcePath?.stage.id || '';
      const stageName = sourcePath?.stage.data.name || '';
      if (!gamesByStage.has(stageId)) {
        gamesByStage.set(stageId, { name: stageName, games: [] });
      }
      gamesByStage.get(stageId)!.games.push(sourceGame);
    });

    // Build options array
    const options: TeamOption[] = [];

    // Add placeholder
    options.push({ value: '', label: '-- Select Team --' });

    // Add static teams with colors
    globalTeams.forEach((team) => {
      options.push({
        value: team.id,
        label: team.label,
        color: team.color || '#6c757d',
        isTeam: true
      });
    });

    // Add dynamic references grouped by stage
    Array.from(gamesByStage.entries()).forEach(([stageId, stageData]) => {
      // Find stage node to get color
      const stageNode = allNodes.find(n => n.id === stageId);
      const stageColor = stageNode && 'color' in stageNode.data ? stageNode.data.color : '#0d6efd';

      // Add stage header separator
      options.push({
        value: `stage-header-${stageId}`,
        label: stageData.name,
        color: stageColor,
        isStageHeader: true,
        isDisabled: true
      });

      // Add winner/loser options for games in this stage
      stageData.games.forEach((sourceGame) => {
        options.push({
          value: `winner:${sourceGame.id}`,
          label: `⚡ Winner of ${sourceGame.data.standing}`,
          isTeam: false
        });
        options.push({
          value: `loser:${sourceGame.id}`,
          label: `💔 Loser of ${sourceGame.data.standing}`,
          isTeam: false
        });
      });
    });

    // Find selected option
    const selectedOption = options.find(opt => opt.value === currentValue) || options[0];

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select<TeamOption>
          value={selectedOption}
          options={options}
          onChange={(newValue) => {
            if (newValue) {
              handleTeamChange(game.id, slot, newValue.value);
            }
          }}
          components={{
            Option: CustomOption,
            SingleValue: CustomSingleValue
          }}
          isOptionDisabled={(option) => option.isDisabled || false}
          menuPortalTarget={document.body}
          menuPosition="fixed"
          styles={customSelectStyles}
          isClearable={false}
          isSearchable={false}
        />
      </div>
    );
  };

  if (games.length === 0) {
    return (
      <div className="text-muted text-center py-2">
        <i className="bi bi-trophy me-2"></i>
        No games in this stage.
      </div>
    );
  }

  return (
    <Table striped bordered hover size="sm">
      <thead>
        <tr>
          <th>Standing</th>
          <th>Home</th>
          <th>Away</th>
          <th>Official</th>
          <th>Break After</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => {
          const isSelected = selectedNodeId === game.id;
          const isEditingStanding = editingGameId === game.id && editingField === 'standing';
          const isEditingBreakAfter = editingGameId === game.id && editingField === 'breakAfter';

          return (
            <tr
              key={game.id}
              id={`game-${game.id}`}
              onClick={(e) => handleRowClick(e, game.id)}
              style={{
                cursor: 'pointer',
                backgroundColor: isSelected ? '#fff3cd' : undefined,
              }}
            >
              {/* Standing column - inline editable */}
              <td onClick={(e) => e.stopPropagation()}>
                {isEditingStanding ? (
                  <Form.Control
                    type="text"
                    size="sm"
                    value={editedValue}
                    onChange={(e) => setEditedValue(e.target.value)}
                    onBlur={() => handleSaveEdit(game.id, 'standing')}
                    onKeyDown={(e) => handleKeyPress(e, game.id, 'standing')}
                    autoFocus
                    style={{ fontSize: '0.875rem' }}
                  />
                ) : (
                  <span
                    onClick={(e) => handleStartEdit(e, game, 'standing')}
                    style={{ cursor: 'text' }}
                    title="Click to edit"
                  >
                    {game.data.standing}
                  </span>
                )}
              </td>

              {/* Home team column */}
              <td>{renderTeamCell(game, 'home')}</td>

              {/* Away team column */}
              <td>{renderTeamCell(game, 'away')}</td>

              {/* Official column */}
              <td>{renderOfficialCell(game)}</td>

              {/* Break After column - inline editable */}
              <td onClick={(e) => e.stopPropagation()}>
                {isEditingBreakAfter ? (
                  <Form.Control
                    type="number"
                    size="sm"
                    value={editedValue}
                    onChange={(e) => setEditedValue(e.target.value)}
                    onBlur={() => handleSaveEdit(game.id, 'breakAfter')}
                    onKeyDown={(e) => handleKeyPress(e, game.id, 'breakAfter')}
                    autoFocus
                    min="0"
                    style={{ fontSize: '0.875rem', width: '80px' }}
                  />
                ) : (
                  <span
                    onClick={(e) => handleStartEdit(e, game, 'breakAfter')}
                    style={{ cursor: 'text' }}
                    title="Click to edit"
                  >
                    {game.data.breakAfter || 0}
                  </span>
                )}
              </td>

              {/* Actions column */}
              <td>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={(e) => handleDelete(e, game.id)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

export default GameTable;
