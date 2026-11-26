import { describe, expect, it, vi } from 'vitest';

vi.mock('react-select', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-select')>();
  return {
    ...actual,
    components: {
      Option: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SingleValue: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  };
});

import { render, screen } from '@testing-library/react';
import type { GroupBase, OptionProps, SingleValueProps } from 'react-select';

import {
  CustomOption,
  CustomSingleValue,
  buildGroupedTeamOptions,
  customSelectStyles,
} from '../game-table/teamOptions';
import type { TeamOption } from '../game-table/teamOptions';
import type { GlobalTeam, GlobalTeamGroup } from '../../../types/flowchart';

const t = (key: string) => (key === 'ui:message.ungrouped' ? 'Ohne Gruppe' : key);

const team = (
  id: string,
  groupId: string | null,
  order: number,
  color?: string
): GlobalTeam => ({ id, label: `Team ${id}`, groupId, order, color });

const group = (id: string, order: number, color?: string): GlobalTeamGroup => ({
  id,
  name: `Gruppe ${id}`,
  order,
  color,
});

describe('buildGroupedTeamOptions (Phase 3 characterization)', () => {
  it('handles empty inputs', () => {
    expect(buildGroupedTeamOptions([], [], t)).toEqual([]);
    expect(buildGroupedTeamOptions([team('u', null, 1)], [], t)).toHaveLength(2);
  });

  it('skips an officials group with no teams', () => {
    const options = buildGroupedTeamOptions(
      [team('r', 'g1', 1)],
      [group('group-officials', 0), group('g1', 1)],
      t
    );
    expect(options.map((option) => option.value)).toEqual([
      'group-header-g1',
      'r',
    ]);
  });

  it('puts the officials group first and keeps its colour fallback', () => {
    const options = buildGroupedTeamOptions(
      [
        team('o1', 'group-officials', 2),
        team('o2', 'group-officials', 1),
        team('r1', 'g1', 1, '#ff0000'),
        team('u1', null, 2),
        team('u2', null, 1),
      ],
      [group('g1', 1), group('group-officials', 0)],
      t
    );
    expect(options.map((option) => option.value)).toEqual([
      'group-header-group-officials',
      'o2',
      'o1',
      'group-header-g1',
      'r1',
      'group-header-ungrouped',
      'u2',
      'u1',
    ]);
    expect(options[0]).toMatchObject({
      label: 'Gruppe group-officials',
      color: '#6c757d',
      isStageHeader: true,
      isDisabled: true,
    });
    expect(options.find((option) => option.value === 'r1')?.color).toBe('#ff0000');
  });

  it('uses an explicit group colour, skips empty groups and sorts teams by order', () => {
    const options = buildGroupedTeamOptions(
      [team('b', 'g1', 2), team('a', 'g1', 1)],
      [group('empty', 0), group('g1', 1, '#123456')],
      t
    );
    expect(options.map((option) => option.value)).toEqual([
      'group-header-g1',
      'a',
      'b',
    ]);
    expect(options[0].color).toBe('#123456');
  });
});

describe('custom select styles and renderers', () => {
  it('returns the shipped control styles', () => {
    const provided = { borderColor: 'old' } as Record<string, unknown>;
    expect(customSelectStyles.control?.(provided as never, {} as never)).toMatchObject({
      minHeight: '31px',
    });
    expect(customSelectStyles.option?.(provided as never, {} as never)).toMatchObject({
      fontSize: '0.875rem',
    });
    expect(customSelectStyles.menu?.(provided as never, {} as never)).toMatchObject({
      zIndex: 9999,
    });
    expect(customSelectStyles.menuPortal?.(provided as never, {} as never)).toMatchObject({
      zIndex: 9999,
    });
    expect(customSelectStyles.singleValue?.(provided as never, {} as never)).toMatchObject({
      fontSize: '0.875rem',
    });
  });

  it('renders stage headers, coloured team options and winner single values', () => {
    const headerProps = {
      data: { value: 'h', label: 'Header', isStageHeader: true, color: '#abc' },
      children: null,
      innerProps: {},
      innerRef: vi.fn(),
      isDisabled: true,
      isSelected: false,
      isFocused: false,
      selectProps: {},
      type: 'option',
      cx: () => '',
    } as unknown as OptionProps<TeamOption, false, GroupBase<TeamOption>>;
    render(<CustomOption {...headerProps} />);
    expect(screen.getByText('Header')).toBeTruthy();

    render(
      <CustomOption
        {...({
          ...headerProps,
          data: { value: 'h2', label: 'PlainHeader', isStageHeader: true },
        } as unknown as OptionProps<TeamOption, false, GroupBase<TeamOption>>)}
      />
    );
    expect(screen.getByText('PlainHeader')).toBeTruthy();

    const teamProps = {
      ...headerProps,
      data: { value: 't', label: 'Coloured', color: '#def' },
      isDisabled: false,
    } as unknown as OptionProps<TeamOption, false, GroupBase<TeamOption>>;
    render(<CustomOption {...teamProps} />);
    expect(screen.getByText('Coloured')).toBeTruthy();

    const plainProps = {
      ...headerProps,
      data: { value: 'p', label: 'plain' },
      isDisabled: false,
    } as unknown as OptionProps<TeamOption, false, GroupBase<TeamOption>>;
    render(<CustomOption {...plainProps} />);
    expect(screen.getByText('plain')).toBeTruthy();

    const singleProps = {
      ...headerProps,
      data: {
        value: 'w',
        label: 'Winner',
        color: '#fff',
        isWinner: true,
        winnerLabel: 'Sieger',
      },
    } as unknown as SingleValueProps<TeamOption, false, GroupBase<TeamOption>>;
    render(<CustomSingleValue {...singleProps} />);
    expect(screen.getByText(/Winner/)).toBeTruthy();

    render(<CustomSingleValue {...(plainProps as unknown as SingleValueProps<TeamOption, false, GroupBase<TeamOption>>)} />);
    expect(screen.getAllByText('plain').length).toBeGreaterThan(0);
  });
});
