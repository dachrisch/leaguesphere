import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TemplateLibraryModal from '../../TemplateLibraryModal';
import { designerApi } from '../../../../api/designerApi';
import { getTeamColor } from '../../../../utils/tournamentConstants';

vi.mock('../../../../api/designerApi');

const mockEmpty = { results: [], count: 0, next: null, previous: null };
// Realistic backend PKs (non-sequential) so id-format bugs can't hide
// behind coincidental 1..N fixtures.
const leagueTeams = [
  { id: 138, name: 'Aachen' },
  { id: 522, name: 'Antwerp' },
  { id: 711, name: 'Bamberg' },
  { id: 904, name: 'Chemnitz' },
];

const expectedSwissTeams = leagueTeams.map((t, i) => ({
  id: String(t.id),
  label: t.name,
  groupId: null,
  order: i,
  color: getTeamColor(i),
  associationAbbr: null,
}));

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

  it('confirms with seed ids in picked order plus page-1 Configure defaults', async () => {
    const onGenerateSwiss = await reachSwissSetup();

    fireEvent.click(screen.getByTestId('swiss-setup-confirm'));

    // SWISS Configure defaults: fieldOptions[0] = 1 field, 30 min/game.
    expect(onGenerateSwiss).toHaveBeenCalledWith({
      seedTeamIds: [138, 522, 711, 904],
      rounds: 4,
      fields: 1,
      gameDuration: 30,
      teams: expectedSwissTeams,
    });
  });

  it('carries edited page-1 Configure fields/duration into the swiss setup confirm', async () => {
    const onGenerateSwiss = vi.fn();
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
    fireEvent.change(screen.getByTestId('configure-game-duration'), { target: { value: '45' } });
    fireEvent.change(screen.getByTestId('configure-num-fields'), { target: { value: '3' } });
    fireEvent.click(await screen.findByTestId('apply-template-button'));
    for (const team of leagueTeams) {
      fireEvent.click(await screen.findByRole('button', { name: team.name }));
    }
    fireEvent.click(screen.getByRole('button', { name: /apply to gameday/i }));
    await screen.findByTestId('swiss-seed-list');
    fireEvent.click(screen.getByTestId('swiss-setup-confirm'));

    expect(onGenerateSwiss).toHaveBeenCalledWith({
      seedTeamIds: [138, 522, 711, 904],
      rounds: 4,
      fields: 3,
      gameDuration: 45,
      teams: expectedSwissTeams,
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
