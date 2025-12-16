/**
 * GlobalTeamTable Component
 *
 * Displays and manages the global team pool organized into collapsible groups.
 * Features:
 * - CSS Grid layout for responsive display (max 4 columns)
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
import TeamGroupCard from './TeamGroupCard';
import './GlobalTeamTable.css';

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


  // Ungrouped teams
  const ungroupedTeams = teamsByGroup.get(null) || [];

  /**
   * Render ungrouped teams in the same card style as groups.
   */
  const renderUngroupedTeamsCard = () => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
      <Card className="team-group-card h-100">
        <Card.Header
          className="d-flex align-items-center"
          style={{ cursor: 'pointer', backgroundColor: '#f8f9fa' }}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <i
            className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} me-2`}
            style={{ fontSize: '0.9rem' }}
          ></i>
          <strong className="flex-grow-1">Ungrouped Teams</strong>
          <span className="badge bg-secondary">{ungroupedTeams.length}</span>
        </Card.Header>
        {isExpanded && (
          <Card.Body className="p-0">
            {ungroupedTeams.map((team, idx) => {
              const isEditing = editingTeamId === team.id;
              const usages = getTeamUsage(team.id);

              return (
                <div
                  key={team.id}
                  className="d-flex align-items-center justify-content-between py-2 px-2 border-bottom"
                  style={{ backgroundColor: '#fff', fontSize: '0.875rem' }}
                >
                  {/* Team label */}
                  <div className="flex-grow-1 me-2" style={{ minWidth: 0 }}>
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
                        className="text-truncate d-block"
                      >
                        {team.label}
                      </span>
                    )}
                  </div>

                  {/* Usage count */}
                  <div className="me-2 flex-shrink-0">
                    <small className="text-muted">
                      <strong>{usages.length}</strong>
                    </small>
                  </div>

                  {/* Actions */}
                  <div className="d-flex gap-1 flex-shrink-0">
                    <button
                      className="btn btn-sm btn-outline-secondary p-1"
                      onClick={() => onReorder(team.id, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                      style={{ fontSize: '0.75rem', lineHeight: 1 }}
                    >
                      <i className="bi bi-arrow-up"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary p-1"
                      onClick={() => onReorder(team.id, 'down')}
                      disabled={idx === ungroupedTeams.length - 1}
                      title="Move down"
                      style={{ fontSize: '0.75rem', lineHeight: 1 }}
                    >
                      <i className="bi bi-arrow-down"></i>
                    </button>
                    <DropdownButton
                      id={`move-team-${team.id}`}
                      title={<i className="bi bi-folder"></i>}
                      size="sm"
                      variant="outline-primary"
                      className="p-0"
                    >
                      <Dropdown.Item onClick={() => handleMoveToGroup(team.id, null)}>
                        Ungrouped
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      {sortedGroups.map((g) => (
                        <Dropdown.Item
                          key={g.id}
                          onClick={() => handleMoveToGroup(team.id, g.id)}
                          active={team.groupId === g.id}
                        >
                          {g.name}
                        </Dropdown.Item>
                      ))}
                    </DropdownButton>
                    <button
                      className="btn btn-sm btn-outline-danger p-1"
                      onClick={() => onDelete(team.id)}
                      title="Delete team"
                      style={{ fontSize: '0.75rem', lineHeight: 1 }}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </Card.Body>
        )}
      </Card>
    );
  };

  return (
    <div>
      {/* Add Group button */}
      <div className="mb-3">
        <Button size="sm" variant="outline-primary" onClick={onAddGroup}>
          <i className="bi bi-plus-circle me-1"></i>
          Add Group
        </Button>
      </div>

      {/* CSS Grid layout for groups */}
      <div className="team-groups-grid">
        {/* Render group cards */}
        {sortedGroups.map((group, index) => {
          const teamsInGroup = teamsByGroup.get(group.id) || [];
          return (
            <TeamGroupCard
              key={group.id}
              group={group}
              teams={teamsInGroup}
              allGroups={sortedGroups}
              onUpdateGroup={onUpdateGroup}
              onDeleteGroup={onDeleteGroup}
              onReorderGroup={onReorderGroup}
              onUpdateTeam={onUpdate}
              onDeleteTeam={onDelete}
              onReorderTeam={onReorder}
              getTeamUsage={getTeamUsage}
              index={index}
              totalGroups={sortedGroups.length}
            />
          );
        })}

        {/* Ungrouped teams card */}
        {ungroupedTeams.length > 0 && renderUngroupedTeamsCard()}
      </div>

      {/* Empty state */}
      {teams.length === 0 && sortedGroups.length === 0 && (
        <div className="text-center text-muted py-4">
          <i className="bi bi-people me-2"></i>
          No teams yet. Click "Add Team" to create your first team.
        </div>
      )}

      {/* No groups message */}
      {sortedGroups.length === 0 && teams.length > 0 && (
        <div className="text-center text-muted py-3 mb-3">
          <small>No groups yet. Click "Add Group" to organize your teams.</small>
        </div>
      )}
    </div>
  );
};

export default GlobalTeamTable;
