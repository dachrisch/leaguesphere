import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { GameResultsTable } from '../GameResultsTable';

describe('GameResultsTable', () => {
  const mockGames = [
    {
      id: 1,
      field: 1,
      scheduled: '10:00',
      status: 'PUBLISHED',
      results: [
        { id: 1, team: { id: 1, name: 'Team A' }, fh: null, sh: null, isHome: true },
        { id: 2, team: { id: 2, name: 'Team B' }, fh: null, sh: null, isHome: false }
      ]
    }
  ];

  it('renders game table with teams', () => {
    render(<GameResultsTable games={mockGames} onSave={vi.fn()} />);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });

  it('allows editing first half score', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <GameResultsTable games={mockGames} onSave={onSave} />
    );

    const inputs = container.querySelectorAll('input[type="number"]');
    const firstHalfInput = inputs[0];

    await userEvent.clear(firstHalfInput);
    await userEvent.type(firstHalfInput, '2');

    expect(firstHalfInput).toHaveValue(2);
  });

  it('calls onSave when scores are committed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <GameResultsTable games={mockGames} onSave={onSave} />
    );

    const inputs = container.querySelectorAll('input[type="number"]');
    await userEvent.type(inputs[0], '2');
    await userEvent.type(inputs[1], '1');

    const saveButton = screen.getByText(/Save Results/i);
    await userEvent.click(saveButton);

    expect(onSave).toHaveBeenCalled();
  });

  it('shows validation error for incomplete scores', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <GameResultsTable games={mockGames} onSave={onSave} />
    );

    const inputs = container.querySelectorAll('input[type="number"]');
    await userEvent.type(inputs[0], '2');
    // Only first half entered, not second half

    const saveButton = screen.getByText(/Save Results/i);
    await userEvent.click(saveButton);

    expect(screen.getByText(/Enter both halves/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
