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

describe('SwissSetupStep', () => {
  it('renders seeds in picked order with schedule preview', () => {
    render(<SwissSetupStep teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

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
    render(<SwissSetupStep teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByTestId('swiss-seed-down-11'));

    const list = screen.getByTestId('swiss-seed-list');
    const first = within(list).getAllByRole('listitem')[0];
    expect(first.textContent).toContain('Team 22');
    fireEvent.click(screen.getByTestId('swiss-seed-up-11'));
    const restored = within(list).getAllByRole('listitem')[0];
    expect(restored.textContent).toContain('Team 11');
  });

  it('clamps steppers to the valid ranges', () => {
    render(<SwissSetupStep teams={makeTeams()} onBack={vi.fn()} onConfirm={vi.fn()} />);

    const roundsDecrease = screen.getByTestId('swiss-rounds-decrease');
    fireEvent.click(roundsDecrease);
    fireEvent.click(roundsDecrease);
    fireEvent.click(roundsDecrease);
    expect(screen.getByTestId('swiss-rounds')).toHaveTextContent('2');

    const fieldsIncrease = screen.getByTestId('swiss-fields-increase');
    for (let i = 0; i < 10; i++) fireEvent.click(fieldsIncrease);
    expect(screen.getByTestId('swiss-fields')).toHaveTextContent('4');

    expect(screen.getByTestId('swiss-schedule-preview').children).toHaveLength(2);
  });

  it('confirms with parsed team ids and current setup values', () => {
    const onConfirm = vi.fn();
    render(<SwissSetupStep teams={makeTeams()} onBack={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId('swiss-seed-down-11'));
    fireEvent.click(screen.getByTestId('swiss-rounds-increase'));
    fireEvent.click(screen.getByTestId('swiss-setup-confirm'));

    expect(onConfirm).toHaveBeenCalledWith({
      seedTeamIds: [22, 11, 33, 44],
      rounds: 5,
      fields: 2,
      gameDuration: 30,
    });
  });

  it('calls onBack', () => {
    const onBack = vi.fn();
    render(<SwissSetupStep teams={makeTeams()} onBack={onBack} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByText('modal:swissSetup.back'));
    expect(onBack).toHaveBeenCalled();
  });
});
