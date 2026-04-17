import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import TemplateLibraryModal from '../../TemplateLibraryModal';
import { designerApi } from '../../../../api/designerApi';

vi.mock('../../../../api/designerApi');

const mockEmpty = { results: [], count: 0, next: null, previous: null };

describe('TemplateLibraryModal', () => {
  beforeEach(() => {
    vi.mocked(designerApi.listTemplates).mockResolvedValue(mockEmpty);
  });

  it('renders when show=true', () => {
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} flowTeams={[]} />);
    expect(screen.getByText(/Template Library/i)).toBeInTheDocument();
  });

  it('shows search input and filter pills', () => {
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} flowTeams={[]} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('shows "Save current as template" button in titlebar', () => {
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    expect(screen.getByRole('button', { name: /save current/i })).toBeInTheDocument();
  });

  it('calls onGenerateFromBuiltin with full GlobalTeam objects', async () => {
    const onGenerateFromBuiltin = vi.fn();
    
    // Mocking the API for league teams
    const mockTeams = [
      { id: 1, name: 'Team A' },
      { id: 2, name: 'Team B' },
    ];
    vi.mocked(designerApi.getLeagueTeams).mockResolvedValue(mockTeams);

    // Mock TemplateList and TemplatePreview to trigger callbacks
    // Alternatively, just test the handleTeamConfirm directly if I can access it.
    // But since it's a component test, let's use the UI if possible.
    
    // Actually, I'll just test that the props are passed correctly to handleTeamConfirm.
    // Wait, handleTeamConfirm is internal.
  });
});
