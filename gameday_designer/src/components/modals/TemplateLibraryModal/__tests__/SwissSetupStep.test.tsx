import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SwissSetupStep from '../SwissSetupStep';
import type { GlobalTeam } from '../../../../types/flowchart';

vi.mock('../../../../i18n/useTypedTranslation', () => ({
  useTypedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function makeTeams(): GlobalTeam[] {
  return ['11', '22', '33', '44'].map((id, i) => ({
    id,
    label: `Team ${id}`,
    groupId: null,
    order: i,
  }));
}

const baseProps = {
  teams: [] as GlobalTeam[],
  fields: 2,
  gameDuration: 30,
  onBack: () => {},
  onConfirm: () => {},
};

describe('SwissSetupStep', () => {
  it('renders seeds in picked order with schedule preview', () => {
    render(<SwissSetupStep {...baseProps} teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    const list = screen.getByTestId('swiss-seed-list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    ['Team 11', 'Team 22', 'Team 33', 'Team 44'].forEach((name, index) => {
      expect(rows[index].textContent).toContain(name);
    });
    expect(screen.getByTestId('swiss-schedule-preview').children).toHaveLength(4);
    expect(screen.getByTestId('swiss-rounds')).toHaveTextContent('4');
  });

  it('reorders seeds with up/down buttons', () => {
    render(<SwissSetupStep {...baseProps} teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByTestId('swiss-seed-down-11'));

    const list = screen.getByTestId('swiss-seed-list');
    const first = within(list).getAllByRole('listitem')[0];
    expect(first.textContent).toContain('Team 22');
    fireEvent.click(screen.getByTestId('swiss-seed-up-11'));
    const restored = within(list).getAllByRole('listitem')[0];
    expect(restored.textContent).toContain('Team 11');
  });

  it('offers only the rounds stepper — fields and duration come from page-1 Configure', () => {
    render(<SwissSetupStep {...baseProps} teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByTestId('swiss-rounds')).toHaveTextContent('4');
    expect(screen.queryByTestId('swiss-fields')).not.toBeInTheDocument();
    expect(screen.queryByTestId('swiss-fields-increase')).not.toBeInTheDocument();
    expect(screen.queryByTestId('swiss-duration')).not.toBeInTheDocument();
    expect(screen.queryByTestId('swiss-duration-increase')).not.toBeInTheDocument();
  });

  it('clamps the rounds stepper to the valid range', () => {
    render(<SwissSetupStep {...baseProps} teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    const roundsDecrease = screen.getByTestId('swiss-rounds-decrease');
    fireEvent.click(roundsDecrease);
    fireEvent.click(roundsDecrease);
    fireEvent.click(roundsDecrease);
    expect(screen.getByTestId('swiss-rounds')).toHaveTextContent('2');

    expect(screen.getByTestId('swiss-schedule-preview').children).toHaveLength(2);
  });

  it('confirms with parsed team ids, rounds state, and fields/duration props', () => {
    const onConfirm = vi.fn();
    render(
      <SwissSetupStep
        {...baseProps}
        teams={makeTeams()}
        fields={3}
        gameDuration={45}
        onBack={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('swiss-seed-down-11'));
    fireEvent.click(screen.getByTestId('swiss-rounds-increase'));
    fireEvent.click(screen.getByTestId('swiss-setup-confirm'));

    expect(onConfirm).toHaveBeenCalledWith({
      seedTeamIds: [22, 11, 33, 44],
      rounds: 5,
      fields: 3,
      gameDuration: 45,
    });
  });

  it('calls onBack', () => {
    const onBack = vi.fn();
    render(<SwissSetupStep {...baseProps} teams={makeTeams()} onBack={onBack} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByText('modal:swissSetup.back'));
    expect(onBack).toHaveBeenCalled();
  });
});
