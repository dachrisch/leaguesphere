import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import TemplateLibraryModal from '../../TemplateLibraryModal';
import { designerApi } from '../../../../api/designerApi';

vi.mock('../../../../api/designerApi');

const mockEmpty = { results: [], count: 0, next: null, previous: null };

describe('TemplateLibraryModal', () => {
  beforeEach(() => {
    vi.mocked(designerApi.listTemplates).mockResolvedValue(mockEmpty);
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: true });
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

  it('shows "Save current as template" button in titlebar for staff', async () => {
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save current/i })).toBeInTheDocument();
    });
  });

  it('hides "Save current as template" button for non-staff', async () => {
    vi.mocked(designerApi.getConfig).mockResolvedValue({ mock_teams: false, is_staff: false });
    render(<TemplateLibraryModal show onHide={vi.fn()} gamedayId={1} currentUserId={1} />);
    await waitFor(() => {
      expect(designerApi.getConfig).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /save current/i })).not.toBeInTheDocument();
  });
});
