import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import TeamPickerStep from '../TeamPickerStep';
import React from 'react';

const mockTeams = [
  { id: '1', label: 'Team A', groupId: null, order: 0 },
  { id: '2', label: 'Team B', groupId: null, order: 1 },
  { id: '3', label: 'Team C', groupId: null, order: 2 },
];

describe('TeamPickerStep', () => {
  it('shows required team count', () => {
    render(<TeamPickerStep requiredTeams={6} availableTeams={mockTeams} onConfirm={vi.fn()} onBack={vi.fn()} />);
    // There are two "6"s: one in <strong> and one in <Badge>
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
  });

  it('auto-selects available teams up to requiredTeams', () => {
    render(<TeamPickerStep requiredTeams={2} availableTeams={mockTeams} onConfirm={vi.fn()} onBack={vi.fn()} />);
    // Check that exactly 2 are selected (bg-primary)
    const badges = screen.getAllByText(/Team [A-C]/);
    const selectedBadges = badges.filter(b => b.classList.contains('bg-primary'));
    expect(selectedBadges.length).toBe(2);
  });

  it('toggles selection and disables/enables Apply button', () => {
    // Start with 4 required, only 3 available -> should be disabled
    render(<TeamPickerStep requiredTeams={4} availableTeams={mockTeams} onConfirm={vi.fn()} onBack={vi.fn()} />);
    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).toBeDisabled();

    // Deselect one
    fireEvent.click(screen.getByText('Team A'));
    // Now 2 selected
    const selectedBadges = screen.getAllByText(/Team [A-C]/).filter(b => b.classList.contains('bg-primary'));
    expect(selectedBadges.length).toBe(2);
    
    // Select it back
    fireEvent.click(screen.getByText('Team A'));
    const reSelectedBadges = screen.getAllByText(/Team [A-C]/).filter(b => b.classList.contains('bg-primary'));
    expect(reSelectedBadges.length).toBe(3);
    expect(applyButton).toBeDisabled(); // Still 3 < 4
  });

  it('calls onConfirm with selected team objects', () => {
    const onConfirm = vi.fn();
    render(<TeamPickerStep requiredTeams={2} availableTeams={mockTeams} onConfirm={onConfirm} onBack={vi.fn()} />);
    
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    
    expect(onConfirm).toHaveBeenCalledWith([
      mockTeams[0],
      mockTeams[1],
    ]);
  });

  it('handles auto-generation of teams', async () => {
    const mockGenerated = [
      { id: 'gen-1', label: 'New Team 1', groupId: null, order: 3 },
    ];
    const onAutoGenerate = vi.fn().mockResolvedValue(mockGenerated);
    
    render(<TeamPickerStep requiredTeams={4} availableTeams={mockTeams} onConfirm={vi.fn()} onBack={vi.fn()} onAutoGenerateTeams={onAutoGenerate} />);
    
    const genButton = screen.getByText(/auto-generate 1 missing teams/i);
    fireEvent.click(genButton);
    
    await waitFor(() => {
      expect(onAutoGenerate).toHaveBeenCalledWith(1);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/New Team 1/)).toBeInTheDocument();
    });
    
    // Check that 4 teams are now selected
    const selectedBadges = screen.getAllByText(/Team/i).filter(b => b.classList.contains('bg-primary'));
    expect(selectedBadges.length).toBe(4); 
  });
});
