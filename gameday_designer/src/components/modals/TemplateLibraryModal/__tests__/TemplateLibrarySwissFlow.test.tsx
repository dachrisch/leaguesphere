import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TemplateLibraryModal from '../../TemplateLibraryModal';
import { designerApi } from '../../../../api/designerApi';

vi.mock('../../../../api/designerApi');

const mockEmpty = { results: [], count: 0, next: null, previous: null };
const leagueTeams = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
  { id: 4, name: 'Delta' },
];

describe('TemplateLibraryModal swiss flow (#1970)', () => {
  beforeEach(() => {
    vi.mocked(designerApi.listTemplates).mockResolvedValue(mockEmpty);
    vi.mocked(designerApi.getConfig).mockResolvedValue({
      mock_teams: false,
      is_staff: true,
      username: 'testuser',
      avatar_url: null,
    });
    vi.mocked(designerApi.getLeagueTeams).mockResolvedValue(leagueTeams);
  });

  async function reachSwissSetup(onGenerateSwiss = vi.fn()) {
    render(
      <TemplateLibraryModal
        show
        onHide={vi.fn()}
        gamedayId={1}
        currentUserId={1}
        onGenerateSwiss={onGenerateSwiss}
      />,
    );
    fireEvent.click(await screen.findByTestId('builtin-template-SWISS'));
    fireEvent.click(await screen.findByTestId('apply-template-button'));
    for (const team of leagueTeams) {
      fireEvent.click(await screen.findByRole('button', { name: team.name }));
    }
    fireEvent.click(screen.getByRole('button', { name: /apply to gameday/i }));
    await screen.findByTestId('swiss-seed-list');
    return onGenerateSwiss;
  }

  it('routes the SWISS template through team picking into the swiss setup step', async () => {
    await reachSwissSetup();

    expect(screen.getByTestId('swiss-seed-list')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-setup-confirm')).toBeInTheDocument();
  });

  it('confirms with seed ids in picked order plus rounds/fields/duration', async () => {
    const onGenerateSwiss = await reachSwissSetup();

    fireEvent.click(screen.getByTestId('swiss-setup-confirm'));

    expect(onGenerateSwiss).toHaveBeenCalledWith({
      seedTeamIds: [1, 2, 3, 4],
      rounds: 4,
      fields: 2,
      gameDuration: 30,
    });
  });

  it('returns from swiss setup back to team picking', async () => {
    await reachSwissSetup();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('button', { name: /apply to gameday/i }),
    ).toBeInTheDocument();
  });
});
