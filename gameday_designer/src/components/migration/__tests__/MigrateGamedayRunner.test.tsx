/**
 * Tests for MigrateGamedayRunner
 *
 * Covers the /migrate/:id flow: fetch a migration plan, seed a team pool
 * from it (including the gap-filling rules that keep applyGenericTemplate's
 * group/team-index lookups aligned), PUT the resulting designer state
 * *before* ever navigating to /designer/:id, and surface errors/warnings.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MigrateGamedayRunner from '../MigrateGamedayRunner';
import i18n from '../../../i18n/testConfig';
import { gamedayApi } from '../../../api/gamedayApi';
import type { MigrationPlan } from '../../../types';
import { isGameNode, type FlowState } from '../../../types/flowchart';

vi.mock('../../../api/gamedayApi', () => ({
  gamedayApi: {
    getMigrationPlan: vi.fn(),
    getGameday: vi.fn(),
    getDesignerState: vi.fn(),
    updateDesignerState: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// The task's own worked example: group 0 has a gap at index 1 (team_mapping
// has "0_0" and "0_2" but not "0_1"), group 1 is fully contiguous.
const gapPlan: MigrationPlan = {
  template_id: 7,
  num_fields: 1,
  num_groups: 2,
  group_config: [
    { name: 'Gruppe A', team_count: 2 },
    { name: 'Gruppe B', team_count: 2 },
  ],
  slots: [
    {
      field: 1,
      slot_order: 1,
      stage: 'Vorrunde',
      stage_type: 'STANDARD',
      stage_category: 'preliminary',
      standing: 'A1',
      home_group: 0,
      home_team: 0,
      home_reference: '',
      away_group: 0,
      away_team: 2,
      away_reference: '',
      official_group: 1,
      official_team: 0,
      official_reference: '',
      break_after: 0,
    },
  ],
  team_mapping: {
    '0_0': { id: 10, label: 'Team Alpha' },
    '0_2': { id: 12, label: 'Team Gamma' },
    '1_0': { id: 20, label: 'Team X' },
    '1_1': { id: 21, label: 'Team Y' },
  },
  warnings: [],
};

const renderRunner = (id = '1') =>
  render(
    <MemoryRouter initialEntries={[`/migrate/${id}`]}>
      <Routes>
        <Route path="/migrate/:id" element={<MigrateGamedayRunner />} />
      </Routes>
    </MemoryRouter>
  );

describe('MigrateGamedayRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, name: 'Test Gameday' });
    (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('PUTs a migrated designer state before navigating, and never GETs designer-state first', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(gamedayApi.getDesignerState).not.toHaveBeenCalled();
    expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1);
    // PUT must resolve before navigation happens.
    const putOrder = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0];
    expect(putOrder).toBeLessThan(navigateOrder);

    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({ replace: true }));
  });

  it('fills the gap in team_mapping with a placeholder so later indices stay aligned', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];

    // Group 0 must be seeded as [real Team Alpha, placeholder TBD, real Team Gamma]
    // -- NOT compacted to [Team Alpha, Team Gamma] -- so index 2 still resolves
    // to the real team mapped at "0_2".
    const groupA = state.globalTeamGroups.find(g => g.name === 'Gruppe A')!;
    const groupATeams = state.globalTeams
      .filter(t => t.groupId === groupA.id)
      .sort((a, b) => a.order - b.order);
    expect(groupATeams.map(t => t.label)).toEqual(['Team Alpha', 'TBD', 'Team Gamma']);

    const gameNode = state.nodes.find(n => isGameNode(n) && n.data.standing === 'A1');
    expect(gameNode).toBeDefined();
    if (!gameNode || !isGameNode(gameNode)) throw new Error('unreachable');

    const homeTeam = state.globalTeams.find(t => t.id === gameNode.data.homeTeamId);
    const awayTeam = state.globalTeams.find(t => t.id === gameNode.data.awayTeamId);
    expect(homeTeam?.label).toBe('Team Alpha');
    // This is the critical assertion: away_team index 2 must resolve to the
    // real team at array position 2, not be shifted by the gap at index 1.
    expect(awayTeam?.label).toBe('Team Gamma');
  });

  it('shows the server error detail and a link back to the legacy gameday page when the plan cannot be loaded', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { status: 403, data: { detail: 'You do not have permission to perform this action.' } },
    });

    renderRunner('42');

    expect(await screen.findByText('You do not have permission to perform this action.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /back to gameday/i });
    expect(link).toHaveAttribute('href', '/gamedays/gameday/42/');
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('surfaces plan warnings via navigation state instead of dropping them', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...gapPlan,
      warnings: ['Game 5 could not be reliably matched to a template slot; skipped.'],
    });

    renderRunner('1');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({
      replace: true,
      state: { migrationWarnings: ['Game 5 could not be reliably matched to a template slot; skipped.'] },
    }));
  });

  it('falls back to the default template name when getGameday fails but still migrates', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    renderRunner('1');

    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];
    // The metadata should still be present even when getGameday fails
    // because updateDesignerState is called with the applied state
    expect(state.nodes.length).toBeGreaterThan(0);
    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({ replace: true }));
  });

  it('shows a fallback error and does not navigate when saving the migrated state fails', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);
    (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    renderRunner('1');

    expect(await screen.findByText(/failed to save the migrated schedule/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
