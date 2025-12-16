/**
 * GlobalTeamTable Component
 *
 * Displays and manages the global team pool organized into collapsible groups.
 * Features:
 * - Collapsible group cards
 * - Inline group name editing (double-click)
 * - Team reordering within groups
 * - Move teams between groups via dropdown
 * - "Ungrouped Teams" section for teams without a group
 * - Shows team usage count across games
 */

import React, { useState, useCallback } from 'react';
import { Card, Button, Dropdown, DropdownButton } from 'react-bootstrap';
import type { GlobalTeam, GlobalTeamGroup, FlowNode } from '../../types/flowchart';
import { isGameNode } from '../../types/flowchart';

export interface GlobalTeamTableProps {
  /** All global teams */
  teams: GlobalTeam[];
  /** All global team groups */
  groups: GlobalTeamGroup[];
  /** Callback to add a new group */
  onAddGroup: () => void;
  /** Callback to update group data */
  onUpdateGroup: (groupId: string, data: Partial<Omit<GlobalTeamGroup, 'id'>>) => void;
  /** Callback to delete a group */
  onDeleteGroup: (groupId: string) => void;
  /** Callback to reorder a group */
  onReorderGroup: (groupId: string, direction: 'up' | 'down') => void;
  /** Callback to update team data */
  onUpdate: (teamId: string, data: Partial<Omit<GlobalTeam, 'id'>>) => void;
  /** Callback to delete a team */
  onDelete: (teamId: string) => void;
  /** Callback to reorder a team */
  onReorder: (teamId: string, direction: 'up' | 'down') => void;
  /** Function to get which games use a team */
  getTeamUsage: (teamId: string) => { gameId: string; slot: 'home' | 'away' }[];
  /** All nodes (for resolving game names) */
  allNodes: FlowNode[];
}

/**
 * GlobalTeamTable component with group-based organization.
 */
const GlobalTeamTable: React.FC<GlobalTeamTableProps> = ({
  teams,
  groups,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onReorderGroup,
  onUpdate,
  onDelete,
  onReorder,
  getTeamUsage,
  allNodes,
}) => {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editedGroupName, setEditedGroupName] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editedTeamLabel, setEditedTeamLabel] = useState('');

  /**
   * Toggle group expansion.
   */
  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  /**
   * Start editing a group name.
   */
  const handleStartEditGroup = useCallback((group: GlobalTeamGroup) => {
    setEditingGroupId(group.id);
    setEditedGroupName(group.name);
  }, []);

  /**
   * Save edited group name.
   */
  const handleSaveGroupName = useCallback(
    (groupId: string) => {
      if (editedGroupName.trim() !== '') {
        onUpdateGroup(groupId, { name: editedGroupName.trim() });
      }
      setEditingGroupId(null);
    },
    [editedGroupName, onUpdateGroup]
  );

  /**
   * Cancel group name editing.
   */
  const handleCancelEditGroup = useCallback(() => {
    setEditingGroupId(null);
  }, []);

  /**
   * Handle key press in group name edit input.
   */
  const handleGroupKeyPress = useCallback(
    (e: React.KeyboardEvent, groupId: string) => {
      if (e.key === 'Enter') {
        handleSaveGroupName(groupId);
      } else if (e.key === 'Escape') {
        handleCancelEditGroup();
      }
    },
    [handleSaveGroupName, handleCancelEditGroup]
  );

  /**
   * Start editing a team label.
   */
  const handleStartEditTeam = useCallback((team: GlobalTeam) => {
    setEditingTeamId(team.id);
    setEditedTeamLabel(team.label);
  }, []);

  /**
   * Save edited team label.
   */
  const handleSaveTeamLabel = useCallback(
    (teamId: string) => {
      if (editedTeamLabel.trim() !== '') {
        onUpdate(teamId, { label: editedTeamLabel.trim() });
      }
      setEditingTeamId(null);
    },
    [editedTeamLabel, onUpdate]
  );

  /**
   * Cancel team label editing.
   */
  const handleCancelEditTeam = useCallback(() => {
    setEditingTeamId(null);
  }, []);

  /**
   * Handle key press in team label edit input.
   */
  const handleTeamKeyPress = useCallback(
    (e: React.KeyboardEvent, teamId: string) => {
      if (e.key === 'Enter') {
        handleSaveTeamLabel(teamId);
      } else if (e.key === 'Escape') {
        handleCancelEditTeam();
      }
    },
    [handleSaveTeamLabel, handleCancelEditTeam]
  );

  /**
   * Move a team to a different group.
   */
  const handleMoveToGroup = useCallback(
    (teamId: string, groupId: string | null) => {
      onUpdate(teamId, { groupId });
    },
    [onUpdate]
  );

  // Sort groups by order
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  // Sort teams by order
  const sortedTeams = [...teams].sort((a, b) => a.order - b.order);

  // Group teams by groupId
  const teamsByGroup = new Map<string | null, GlobalTeam[]>();
  teamsByGroup.set(null, []); // Ungrouped teams
  for (const group of sortedGroups) {
    teamsByGroup.set(group.id, []);
  }
  for (const team of sortedTeams) {
    const list = teamsByGroup.get(team.groupId) || [];
    list.push(team);
    teamsByGroup.set(team.groupId, list);
  }

  /**
   * Render a single team row.
   */
  const renderTeam = (team: GlobalTeam, index: number, teamsInGroup: GlobalTeam[]) => {
    const isEditing = editingTeamId === team.id;
    const usages = getTeamUsage(team.id);

    return (
      <div
        key={team.id}
        className="d-flex align-items-center justify-content-between py-2 px-3 border-bottom"
        style={{ backgroundColor: '#fff' }}
      >
        {/* Team label */}
        <div className="flex-grow-1">
          {isEditing ? (
            <input
              type="text"
              className="form-control form-control-sm"
              value={editedTeamLabel}
              onChange={(e) => setEditedTeamLabel(e.target.value)}
              onBlur={() => handleSaveTeamLabel(team.id)}
              onKeyDown={(e) => handleTeamKeyPress(e, team.id)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={() => handleStartEditTeam(team)}
              style={{ cursor: 'text' }}
              title="Double-click to edit"
            >
              {team.label}
            </span>
          )}
        </div>

        {/* Usage count */}
        <div className="mx-3">
          <small className="text-muted">
            Used: <strong>{usages.length}</strong>
          </small>
        </div>

        {/* Actions */}
        <div className="d-flex gap-1">
          {/* Reorder up */}
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onReorder(team.id, 'up')}
            disabled={index === 0}
            title="Move up"
          >
            <i className="bi bi-arrow-up"></i>
          </button>

          {/* Reorder down */}
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onReorder(team.id, 'down')}
            disabled={index === teamsInGroup.length - 1}
            title="Move down"
          >
            <i className="bi bi-arrow-down"></i>
          </button>

          {/* Move to group dropdown */}
          <DropdownButton
            id={`move-team-${team.id}`}
            title={<i className="bi bi-folder"></i>}
            size="sm"
            variant="outline-primary"
          >
            <Dropdown.Item onClick={() => handleMoveToGroup(team.id, null)}>
              Ungrouped
            </Dropdown.Item>
            <Dropdown.Divider />
            {sortedGroups.map((group) => (
              <Dropdown.Item
                key={group.id}
                onClick={() => handleMoveToGroup(team.id, group.id)}
                active={team.groupId === group.id}
              >
                {group.name}
              </Dropdown.Item>
            ))}
          </DropdownButton>

          {/* Delete */}
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => onDelete(team.id)}
            title="Delete team"
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>
      </div>
    );
  };

  /**
   * Render a group card.
   */
  const renderGroup = (group: GlobalTeamGroup, index: number) => {
    const teamsInGroup = teamsByGroup.get(group.id) || [];
    const isExpanded = expandedGroupIds.has(group.id);
    const isEditing = editingGroupId === group.id;

    return (
      <Card key={group.id} className="mb-2">
        <Card.Header
          className="d-flex align-items-center"
          style={{ cursor: 'pointer', backgroundColor: '#e9ecef' }}
          onClick={() => !isEditing && handleToggleGroup(group.id)}
        >
          {/* Expand/collapse icon */}
          <i
            className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-2`}
            style={{ fontSize: '0.9rem' }}
          ></i>

          {/* Group name */}
          <div className="flex-grow-1" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <input
                type="text"
                className="form-control form-control-sm"
                value={editedGroupName}
                onChange={(e) => setEditedGroupName(e.target.value)}
                onBlur={() => handleSaveGroupName(group.id)}
                onKeyDown={(e) => handleGroupKeyPress(e, group.id)}
                autoFocus
              />
            ) : (
              <strong
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartEditGroup(group);
                }}
                style={{ cursor: 'text' }}
                title="Double-click to edit"
              >
                {group.name}
              </strong>
            )}
          </div>

          {/* Team count badge */}
          <span className="badge bg-secondary me-2">{teamsInGroup.length} teams</span>

          {/* Group actions */}
          <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onReorderGroup(group.id, 'up')}
              disabled={index === 0}
              title="Move group up"
            >
              <i className="bi bi-arrow-up"></i>
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onReorderGroup(group.id, 'down')}
              disabled={index === sortedGroups.length - 1}
              title="Move group down"
            >
              <i className="bi bi-arrow-down"></i>
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => onDeleteGroup(group.id)}
              title="Delete group"
            >
              <i className="bi bi-trash"></i>
            </button>
          </div>
        </Card.Header>

        {/* Group body (teams) */}
        {isExpanded && (
          <Card.Body className="p-0">
            {teamsInGroup.length > 0 ? (
              teamsInGroup.map((team, idx) => renderTeam(team, idx, teamsInGroup))
            ) : (
              <div className="text-center text-muted py-3">
                <small>No teams in this group</small>
              </div>
            )}
          </Card.Body>
        )}
      </Card>
    );
  };

  // Ungrouped teams
  const ungroupedTeams = teamsByGroup.get(null) || [];

  return (
    <div>
      {/* Add Group button */}
      <div className="mb-3">
        <Button size="sm" variant="outline-primary" onClick={onAddGroup}>
          <i className="bi bi-plus-circle me-1"></i>
          Add Group
        </Button>
      </div>

      {/* Groups */}
      {sortedGroups.length > 0 ? (
        sortedGroups.map((group, index) => renderGroup(group, index))
      ) : (
        <div className="text-center text-muted py-3 mb-3">
          <small>No groups yet. Click "Add Group" to organize your teams.</small>
        </div>
      )}

      {/* Ungrouped teams section */}
      {ungroupedTeams.length > 0 && (
        <Card className="mb-2">
          <Card.Header style={{ backgroundColor: '#f8f9fa' }}>
            <strong>Ungrouped Teams</strong>
            <span className="badge bg-secondary ms-2">{ungroupedTeams.length} teams</span>
          </Card.Header>
          <Card.Body className="p-0">
            {ungroupedTeams.map((team, idx) => renderTeam(team, idx, ungroupedTeams))}
          </Card.Body>
        </Card>
      )}

      {/* Empty state */}
      {teams.length === 0 && (
        <div className="text-center text-muted py-4">
          <i className="bi bi-people me-2"></i>
          No teams yet. Click "Add Team" to create your first team.
        </div>
      )}
    </div>
  );
};

export default GlobalTeamTable;
