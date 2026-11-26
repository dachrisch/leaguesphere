/**
 * Team-option builders and custom react-select renderers for the designer
 * game table (Phase 3 Layer 5). Moved verbatim from GameTable.tsx.
 */

import { memo } from 'react';
import { components } from 'react-select';
import type { StylesConfig, GroupBase, OptionProps, SingleValueProps } from 'react-select';
import type { GlobalTeam, GlobalTeamGroup } from '../../../types/flowchart';
import type { TeamReference } from '../../../types/designer';

export interface TeamOption {
  value: string;
  label: string;
  color?: string;
  isTeam?: boolean;
  isStageHeader?: boolean;
  isDisabled?: boolean;
  isWinner?: boolean;
  winnerLabel?: string;
  /** Resolved TeamReference for dynamic options (winner/loser/rank/etc.) */
  reference?: TeamReference;
}

// Custom Option component with colored dot for teams and stage headers
export const CustomOption = memo((props: OptionProps<TeamOption, false, GroupBase<TeamOption>>) => {
  const { data } = props;

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
});

// Custom SingleValue component with colored dot for selected value
export const CustomSingleValue = memo((props: SingleValueProps<TeamOption, false, GroupBase<TeamOption>>) => {
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
        <span className={data.isWinner ? 'fw-bold text-success' : ''}>
          {data.label}
          {data.isWinner && <i className="bi bi-trophy-fill text-warning ms-2" title={data.winnerLabel} />}
        </span>
      </div>
    </components.SingleValue>
  );
});

/**
 * Helper function to build team options grouped by team groups.
 */
export function buildGroupedTeamOptions(
  teams: GlobalTeam[],
  groups: GlobalTeamGroup[],
  t: (key: string) => string
): TeamOption[] {
  const options: TeamOption[] = [];
  
  // 1. Prioritize officials group if it exists
  const officialsGroup = groups.find(g => g.id === 'group-officials');
  if (officialsGroup) {
    const groupTeams = teams
      .filter(team => team.groupId === officialsGroup.id)
      .sort((a, b) => a.order - b.order);

    if (groupTeams.length > 0) {
      options.push({
        value: `group-header-${officialsGroup.id}`,
        label: officialsGroup.name,
        color: officialsGroup.color || '#6c757d',
        isStageHeader: true,
        isDisabled: true
      });

      groupTeams.forEach(team => {
        options.push({
          value: team.id,
          label: team.label,
          color: team.color || '#6c757d',
          isTeam: true
        });
      });
    }
  }

  // 2. Regular groups (excluding officials)
  const sortedGroups = [...groups]
    .filter(g => g.id !== 'group-officials')
    .sort((a, b) => a.order - b.order);

  sortedGroups.forEach(group => {
    const groupTeams = teams
      .filter(team => team.groupId === group.id)
      .sort((a, b) => a.order - b.order);

    if (groupTeams.length > 0) {
      options.push({
        value: `group-header-${group.id}`,
        label: group.name,
        color: group.color || '#6c757d',
        isStageHeader: true,
        isDisabled: true
      });

      groupTeams.forEach(team => {
        options.push({
          value: team.id,
          label: team.label,
          color: team.color || '#6c757d',
          isTeam: true
        });
      });
    }
  });

  const ungroupedTeams = teams
    .filter(team => team.groupId === null)
    .sort((a, b) => a.order - b.order);

  if (ungroupedTeams.length > 0) {
    options.push({
      value: 'group-header-ungrouped',
      label: t('ui:message.ungrouped'),
      color: '#adb5bd',
      isStageHeader: true,
      isDisabled: true
    });

    ungroupedTeams.forEach(team => {
      options.push({
        value: team.id,
        label: team.label,
        color: team.color || '#6c757d',
        isTeam: true
      });
    });
  }

  return options;
}

export const customSelectStyles: StylesConfig<TeamOption, false, GroupBase<TeamOption>> = {
  control: (provided) => ({ ...provided, minHeight: '31px', fontSize: '0.875rem', borderColor: '#dee2e6' }),
  option: (provided) => ({ ...provided, fontSize: '0.875rem', padding: '6px 12px' }),
  singleValue: (provided) => ({ ...provided, fontSize: '0.875rem' }),
  menu: (provided) => ({ ...provided, zIndex: 9999 }),
  menuPortal: (provided) => ({ ...provided, zIndex: 9999 })
};
