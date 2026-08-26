/**
 * Tests for MigrateGamedayRunner
 *
 * Covers the /migrate/:id flow: fetch a migration plan, build the migrated
 * Designer canvas in memory and render it read-only in the background (so the
 * user sees exactly what would be saved), show a confirmation dialog that
 * states no data will be changed, and only after the user confirms PUT the
 * in-memory state *before* ever navigating to /designer/:id. Cancelling throws
 * the preview away without writing anything.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MigrateGamedayRunner from '../MigrateGamedayRunner';
import i18n from '../../../i18n/testConfig';
import { gamedayApi } from '../../../api/gamedayApi';
import type { MigrationPlan } from '../../../types';
import { isGameNode, type FlowState } from '../../../types/flowchart';
import { getTeamColor } from '../../../utils/tournamentConstants';

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
      start_time: '10:00',
      manual_time: true,
    },
  ],
  team_mapping: {
    '0_0': { id: 10, label: 'Team Alpha' },
    '0_2': { id: 12, label: 'Team Gamma' },
    '1_0': { id: 20, label: 'Team X' },
    '1_1': { id: 21, label: 'Team Y' },
  },
  warnings: [],
  update_rules: [],
};

const renderRunner = (id = '1') =>
  render(
    <MemoryRouter initialEntries={[`/migrate/${id}`]}>
      <Routes>
        <Route path="/migrate/:id" element={<MigrateGamedayRunner />} />
      </Routes>
    </MemoryRouter>
  );

const clickMigrate = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /^Migrate$/ }));
};

describe('MigrateGamedayRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, name: 'Test Gameday' });
    (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('renders the migrated canvas in the background behind the confirm dialog, writing nothing until confirmed', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    // The confirm dialog is shown on top of the rendered preview.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // The preview already shows the migrated canvas content (the field and a
    // seeded team) without having written anything.
    expect(screen.getByText('Feld 1')).toBeInTheDocument();
    expect(screen.getAllByText('Team Alpha').length).toBeGreaterThan(0);

    // Nothing has been written and no navigation happened yet.
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
    expect(gamedayApi.getDesignerState).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Confirming then triggers exactly the save.
    await clickMigrate();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1);
  });

  it('confirmation dialog states that no data will be changed and that the gameday will be edited in the Designer from now on', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/No data will be changed/i)).toBeInTheDocument();
    expect(screen.getByText(/legacy schedule editor/i)).toBeInTheDocument();
    expect(screen.getByText(/games, results and officials stay exactly as they are/i)).toBeInTheDocument();
    // Buttons are "Don't migrate" and "Migrate".
    expect(screen.getByRole('button', { name: /^Don't migrate$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Migrate$/ })).toBeInTheDocument();
  });

  it('surfaces plan warnings in the confirmation dialog before migrating', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...gapPlan,
      warnings: ['Game 5 could not be reliably matched to a template slot; skipped.'],
    });

    renderRunner('1');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Game 5 could not be reliably matched to a template slot; skipped.')).toBeInTheDocument();
    expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
  });

  it('cancelling throws the preview away and returns to the legacy gameday page without migrating', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    const originalLocation = window.location;
    const testWindow = window as unknown as { location: Location };
    // @ts-expect-error - overriding window.location for test
    delete testWindow.location;
    testWindow.location = { ...originalLocation, href: '' } as Location;

    try {
      renderRunner('42');

      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /^Don't migrate$/ }));

      // The legacy gameday page lives outside the app's basename, so cancel
      // escapes it via a full page navigation (not a router navigate).
      expect(testWindow.location.href).toBe('/gamedays/gameday/42/');
      expect(gamedayApi.updateDesignerState).not.toHaveBeenCalled();
      expect(gamedayApi.getDesignerState).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally {
      testWindow.location = originalLocation;
    }
  });

  it('PUTs the previewed designer state before navigating, and never GETs designer-state first', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(gamedayApi.getDesignerState).not.toHaveBeenCalled();
    expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1);
    // PUT must resolve before navigation happens.
    const putOrder = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0];
    expect(putOrder).toBeLessThan(navigateOrder);

    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({ replace: true }));
  });

  it('saves the exact state that was previewed', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];

    // The preview (rendered before confirmation) and the saved state share the
    // same seeded teams -- group 0 is [Team Alpha, TBD, Team Gamma], not
    // compacted to [Team Alpha, Team Gamma] -- so index 2 still resolves to the
    // real team mapped at "0_2".
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

  it('carries the real game start times and the field/stage start time over from the plan', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];

    const gameNode = state.nodes.find(n => isGameNode(n) && n.data.standing === 'A1');
    expect(gameNode).toBeDefined();
    if (!gameNode || !isGameNode(gameNode)) throw new Error('unreachable');

    // The plan's per-slot start_time is written as a manual (locked) time so
    // the designer's auto-recalc never shifts the migrated games.
    expect(gameNode.data.startTime).toBe('10:00');
    expect(gameNode.data.manualTime).toBe(true);

    // The stage node picks up the field start time (its first game's time).
    const stageNode = state.nodes.find(n => n.id === gameNode.parentId && n.type === 'stage');
    expect(stageNode).toBeDefined();
    if (!stageNode || stageNode.type !== 'stage') throw new Error('unreachable');
    expect(stageNode.data.startTime).toBe('10:00');
  });

  it('assigns each seeded team (including placeholders) a distinct color from the shared palette, not the flat gray fallback', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];

    // Seeding order is group-by-group, index-by-index: Gruppe A produces
    // [Team Alpha, TBD-placeholder, Team Gamma], then Gruppe B produces
    // [Team X, Team Y] -- five teams total, colors cycling continuously
    // across that whole run (not reset per group), matching every other
    // team-seeding path in this app (flowchartImport.ts, useTeamPoolState.ts).
    const orderedLabels = ['Team Alpha', 'TBD', 'Team Gamma', 'Team X', 'Team Y'];
    const byLabelInOrder = orderedLabels.map((label) => {
      // The gap placeholder's label ("TBD") isn't unique by construction if a
      // real team were ever also named "TBD" -- disambiguate by group+order
      // instead of a plain label lookup for that one entry.
      if (label === 'TBD') {
        const groupA = state.globalTeamGroups.find(g => g.name === 'Gruppe A')!;
        return state.globalTeams.find(t => t.groupId === groupA.id && t.order === 1)!;
      }
      return state.globalTeams.find(t => t.label === label)!;
    });

    byLabelInOrder.forEach((team, i) => {
      expect(team.color).toBe(getTeamColor(i));
    });
    // No team should have fallen through to useFlowState's gray default.
    expect(state.globalTeams.every(t => t.color !== '#cccccc')).toBe(true);
    // And no two teams should collide on the same color (palette has far
    // more than 5 entries, so a real bug -- e.g. colorIndex not advancing --
    // would show up as a duplicate here).
    expect(new Set(state.globalTeams.map(t => t.color)).size).toBe(state.globalTeams.length);
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

    await clickMigrate();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({
      replace: true,
      state: { migrationWarnings: ['Game 5 could not be reliably matched to a template slot; skipped.'] },
    }));
  });

  it('merges server warnings with frontend applyGenericTemplate warnings', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...gapPlan,
      slots: [
        ...gapPlan.slots,
        {
          field: 1,
          slot_order: 2,
          stage: 'Finalrunde',
          stage_type: 'STANDARD',
          stage_category: 'final',
          standing: 'HF1',
          home_group: null,
          home_team: null,
          home_reference: 'Winner A1',
          away_group: null,
          away_team: null,
          away_reference: '',
          official_group: null,
          official_team: null,
          official_reference: '',
          break_after: 0,
        },
      ],
      warnings: ['Slot HF1 has an unparseable home_reference: Gewinner HF1.'],
    });

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());

    const navCall = mockNavigate.mock.calls[0];
    const navState = navCall[1]?.state;
    expect(navState?.migrationWarnings).toContain(
      'Slot HF1 has an unparseable home_reference: Gewinner HF1.'
    );
  });

  it('falls back to the default template name when getGameday fails but still migrates', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);
    (gamedayApi.getGameday as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    renderRunner('1');

    await clickMigrate();
    await waitFor(() => expect(gamedayApi.updateDesignerState).toHaveBeenCalledTimes(1));

    const [, state] = (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mock.calls[0] as [number, FlowState];
    // The canvas is still built even when getGameday fails.
    expect(state.nodes.length).toBeGreaterThan(0);
    expect(mockNavigate).toHaveBeenCalledWith('/designer/1', expect.objectContaining({ replace: true }));
  });

  it('shows a fallback error and does not navigate when saving the migrated state fails', async () => {
    (gamedayApi.getMigrationPlan as ReturnType<typeof vi.fn>).mockResolvedValue(gapPlan);
    (gamedayApi.updateDesignerState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    renderRunner('1');

    await clickMigrate();
    expect(await screen.findByText(/failed to save the migrated schedule/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});