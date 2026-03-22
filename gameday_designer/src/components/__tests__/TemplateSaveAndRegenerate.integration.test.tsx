import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { gamedayApi } from '../../api/gamedayApi';
import ListDesignerApp from '../ListDesignerApp';
import AppHeader from '../layout/AppHeader';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';

// ── Router mock ──────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
  };
});

// ── API mock ─────────────────────────────────────────────────────────────────
vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getGameday: vi.fn(),
    publish: vi.fn(),
    patchGameday: vi.fn(),
    deleteGameday: vi.fn(),
    updateGameResult: vi.fn(),
    getGamedayGames: vi.fn().mockResolvedValue([]),
    updateBulkGameResults: vi.fn().mockResolvedValue({}),
    listSeasons: vi.fn().mockResolvedValue([]),
    listLeagues: vi.fn().mockResolvedValue([]),
    getDesignerState: vi.fn(),
    updateDesignerState: vi.fn().mockResolvedValue({}),
    getTemplates: vi.fn(),
    saveTemplate: vi.fn(),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockGameday = {
  id: 1,
  name: 'E2E Test Gameday',
  date: '2026-06-01',
  start: '10:00',
  format: '6_2',
  author: 1,
  address: 'Test Field',
  season: 1,
  league: 1,
  status: 'DRAFT',
  designer_data: { nodes: [], edges: [], fields: [], globalTeams: [], globalTeamGroups: [] },
};

/**
 * Initial designer state: empty schedule with valid metadata.
 * checkMandatoryMetadata requires name, date, start, season, and league to be
 * non-empty/non-zero — without them, isValid=false and the save-as-template button
 * stays disabled. The nodes array is empty so no game-input errors are added.
 */
const initialDesignerState = {
  metadata: {
    id: 1,
    name: 'E2E Test Gameday',
    date: '2026-06-01',
    start: '10:00',
    format: '6_2' as const,
    author: 1,
    address: 'Test Field',
    season: 1,
    league: 1,
    status: 'DRAFT' as const,
  },
  nodes: [],
  edges: [],
  fields: [],
  globalTeams: [],
  globalTeamGroups: [],
};

/** Returned by getTemplates on the second modal open, after save.
 *  Must satisfy GenericTemplate: slots, num_groups, game_duration are required
 *  by applyGenericTemplate to produce a non-empty structure. */
const savedCustomTemplate = {
  id: 99,
  name: 'My Custom Template',
  num_teams: 2,
  num_fields: 1,
  num_groups: 1,
  game_duration: 20,
  description: '',
  sharing: 'PRIVATE' as const,
  association: null,
  slots: [
    { field: 1, slot_order: 1, stage: 'Group Stage', stage_type: 'STANDARD' as const, standing: 'G1', break_after: 0 },
    { field: 1, slot_order: 2, stage: 'Group Stage', stage_type: 'STANDARD' as const, standing: 'G2', break_after: 0 },
  ],
};

describe('Template save-and-regenerate lifecycle', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({ ...mockGameday });
    vi.mocked(gamedayApi.getGamedayGames).mockResolvedValue([]);
    vi.mocked(gamedayApi.getDesignerState).mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state_data: initialDesignerState as any,
    });
    vi.mocked(gamedayApi.saveTemplate).mockResolvedValue(savedCustomTemplate);
    // First modal open → no custom templates yet
    // Second modal open (after save) → saved template appears
    vi.mocked(gamedayApi.getTemplates)
      .mockResolvedValueOnce([])
      .mockResolvedValue([savedCustomTemplate]);
  });

  async function renderApp() {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/designer/1']}>
        <GamedayProvider>
          <AppHeader />
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </GamedayProvider>
      </MemoryRouter>
    );
    await waitFor(
      () => expect(screen.queryByRole('status')).not.toBeInTheDocument(),
      { timeout: 15000 }
    );
    return { user };
  }

  it('generates from built-in template, saves as custom, clears, regenerates from custom', async () => {
    const { user } = await renderApp();

    // ── 1. Open generator modal ───────────────────────────────────────────────
    await user.click(screen.getByTestId('generate-tournament-button'));
    const modal = await screen.findByRole('dialog');

    // ── 2. Save current config as custom template ─────────────────────────────
    // Button is disabled={!isValid}; empty initial state has isValid=true (no errors)
    // Wait for save-as-template-button to exist and be enabled (validation is async)
    const saveAsBtn = await waitFor(() => {
      const btn = within(modal).getByTestId('save-as-template-button');
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveAsBtn);

    // SaveTemplateModal opens — wait for the name input to appear
    const nameInput = await screen.findByTestId('template-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'My Custom Template');

    // Click save in SaveTemplateModal (data-testid="save-template-submit-button")
    await user.click(screen.getByTestId('save-template-submit-button'));

    // Verify API called with template name
    await waitFor(() => {
      expect(gamedayApi.saveTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Custom Template' })
      );
    });

    // SaveTemplateModal closes — template-name-input is gone
    await waitFor(() => expect(screen.queryByTestId('template-name-input')).not.toBeInTheDocument());

    // ── 3. Select built-in template and generate ──────────────────────────────
    // Built-in template IDs come from tournamentTemplates.ts: 'F6-2-2', 'F8-2-3', etc.
    // Click the first one.
    await user.click(screen.getByTestId('builtin-template-F6-2-2'));

    // Select "Generate teams automatically" (type="radio")
    // i18n key: ui:label.generatePlaceholders → EN: "Generate teams automatically"
    // No real teams in test data, so this radio must be selected for canGenerate=true.
    await user.click(screen.getByRole('radio', { name: /generate teams automatically/i }));

    const saveCallsBefore = vi.mocked(gamedayApi.updateDesignerState).mock.calls.length;
    await user.click(screen.getByTestId('confirm-generate-button'));

    // Modal closes after generation
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Auto-save fires after generation (1500ms debounce → need >1500ms timeout)
    await waitFor(() => {
      expect(vi.mocked(gamedayApi.updateDesignerState).mock.calls.length).toBeGreaterThan(saveCallsBefore);
    }, { timeout: 5000 });

    // ── 4. Clear the schedule ─────────────────────────────────────────────────
    // Open GamedayMetadataAccordion
    await user.click(screen.getByTestId('gameday-metadata-toggle'));
    await waitFor(() => expect(screen.getByTestId('clear-all-button')).toBeVisible());

    const clearCallsBefore = vi.mocked(gamedayApi.updateDesignerState).mock.calls.length;
    await user.click(screen.getByTestId('clear-all-button'));
    // No confirmation modal — clear-all is a direct call to flowState.clearAll()

    // Auto-save fires after clear (1500ms debounce → need >1500ms timeout)
    await waitFor(() => {
      expect(vi.mocked(gamedayApi.updateDesignerState).mock.calls.length).toBeGreaterThan(clearCallsBefore);
    }, { timeout: 5000 });

    // ── 5. Reopen generator, pick custom template, regenerate ─────────────────
    await user.click(screen.getByTestId('generate-tournament-button'));
    await screen.findByRole('dialog');

    // getTemplates is called again on modal open → returns [savedCustomTemplate] this time
    // Custom template card should appear
    await waitFor(() => {
      expect(screen.getByTestId('custom-template-99')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('custom-template-99'));

    // Select "Generate teams automatically" again (form resets on each modal open)
    await user.click(screen.getByRole('radio', { name: /generate teams automatically/i }));

    const regenCallsBefore = vi.mocked(gamedayApi.updateDesignerState).mock.calls.length;
    await user.click(screen.getByTestId('confirm-generate-button'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Auto-save fires after second generation (1500ms debounce → need >1500ms timeout)
    await waitFor(() => {
      expect(vi.mocked(gamedayApi.updateDesignerState).mock.calls.length).toBeGreaterThan(regenCallsBefore);
    }, { timeout: 5000 });
  });
});
