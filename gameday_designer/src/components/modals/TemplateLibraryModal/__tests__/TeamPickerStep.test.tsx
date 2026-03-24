import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import TeamPickerStep from '../TeamPickerStep';

const mockTeams = [
  { id: '1', name: 'Team A' },
  { id: '2', name: 'Team B' },
  { id: '3', name: 'Team C' },
];

describe('TeamPickerStep', () => {
  it('shows required team count', () => {
    render(<TeamPickerStep show requiredTeams={6} availableTeams={mockTeams as any} onConfirm={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/6 required/i)).toBeInTheDocument();
  });

  it('disables Confirm when fewer than requiredTeams are selected', () => {
    render(<TeamPickerStep show requiredTeams={3} availableTeams={mockTeams as any} onConfirm={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    fireEvent.click(screen.getByText('Team A'));
    fireEvent.click(screen.getByText('Team B'));
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    fireEvent.click(screen.getByText('Team C'));
    expect(screen.getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });
});
