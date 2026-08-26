/**
 * Tests for ListDesignerApp migration warning surfacing.
 *
 * After MigrateGamedayRunner completes, it navigates to /designer/:id with
 * location.state.migrationWarnings.  ListDesignerApp surfaces those as
 * notifications and clears the location state so they don't reappear on
 * refresh.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListDesignerApp from '../ListDesignerApp';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';
import { useDesignerController } from '../../hooks/useDesignerController';
import { useFlowState } from '../../hooks/useFlowState';
import { gamedayApi } from '../../api/gamedayApi';

vi.mock('../../hooks/useDesignerController');
vi.mock('../../hooks/useFlowState');

const mockNavigate = vi.fn();
let mockLocationState: { migrationWarnings?: string[] } | null = null;

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: '/designer/1',
      state: mockLocationState,
    }),
  };
});

vi.mock('../LanguageSelector', () => ({
  default: () => <div data-testid="language-selector">LanguageSelector</div>,
}));

vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getGameday: vi.fn(),
    patchGameday: vi.fn(),
    publish: vi.fn(),
    updateGameResult: vi.fn(),
    getGamedayGames: vi.fn().mockResolvedValue([]),
    updateBulkGameResults: vi.fn().mockResolvedValue({}),
    listSeasons: vi.fn().mockResolvedValue([]),
    listLeagues: vi.fn().mockResolvedValue([]),
    deleteGameday: vi.fn().mockResolvedValue({}),
  },
}));

const defaultMockReturn = {
  metadata: {
    id: 1,
    name: 'Test Gameday',
    date: '2026-05-01',
    start: '10:00',
    format: '6_2',
    author: 1,
    address: 'Test Field',
    season: 1,
    league: 1,
    status: 'DRAFT',
  },
  nodes: [],
  edges: [],
  globalTeams: [],
  globalTeamGroups: [],
  validation: { isValid: true, errors: [], warnings: [] },
  notifications: [],
  ui: {
    highlightedElement: null,
    expandedFieldIds: new Set(),
    expandedStageIds: new Set(),
    showTournamentModal: false,
    canExport: false,
    hasData: false,
    isLoading: false,
  },
  handlers: {
    handleHighlightElement: vi.fn(),
    handleDynamicReferenceClick: vi.fn(),
    handleImport: vi.fn(),
    handleExport: vi.fn(),
    handleClearAll: vi.fn(),
    handleUpdateNode: vi.fn(),
    handleDeleteNode: vi.fn(),
    handleAddFieldContainer: vi.fn(),
    handleAddStage: vi.fn(),
    handleSelectNode: vi.fn(),
    handleAddGlobalTeam: vi.fn(),
    handleUpdateGlobalTeam: vi.fn(),
    handleDeleteGlobalTeam: vi.fn(),
    handleReorderGlobalTeam: vi.fn(),
    handleAddGlobalTeamGroup: vi.fn(),
    handleAssignTeam: vi.fn(),
    handleGenerateTournament: vi.fn(),
    handleSaveTemplate: vi.fn(),
    dismissNotification: vi.fn(),
    addNotification: vi.fn(),
    loadData: vi.fn().mockResolvedValue(undefined),
    saveData: vi.fn().mockResolvedValue(undefined),
  },
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
};

describe('ListDesignerApp migration warnings', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    mockLocationState = null;
    (useDesignerController as Mock).mockReturnValue(defaultMockReturn);
    (useFlowState as Mock).mockReturnValue({
      nodes: [],
      edges: [],
      globalTeams: [],
      globalTeamGroups: [],
      exportState: vi.fn().mockReturnValue({
        metadata: { id: 1, name: 'Test Gameday' },
        nodes: [],
        edges: [],
        globalTeams: [],
        globalTeamGroups: [],
      }),
    });
    (gamedayApi.getGameday as Mock).mockResolvedValue(defaultMockReturn.metadata);
  });

  it('surfaces migration warnings from location state as notifications', async () => {
    const warnings = [
      'Game 5 could not be reliably matched to a template slot; skipped.',
      'Game 8 could not be reliably matched to a template slot; skipped.',
    ];
    mockLocationState = { migrationWarnings: warnings };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/designer/1', state: { migrationWarnings: warnings } }]}>
        <GamedayProvider>
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </GamedayProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const addNotification = (useDesignerController as Mock).mock.results[0]?.value.handlers.addNotification as Mock;
      expect(addNotification).toHaveBeenCalledWith(
        warnings[0],
        'warning',
        'Migrated with warnings',
      );
      expect(addNotification).toHaveBeenCalledWith(
        warnings[1],
        'warning',
        'Migrated with warnings',
      );
    });
  });

  it('does not surface warnings when location state has no migrationWarnings', async () => {
    mockLocationState = {};

    render(
      <MemoryRouter initialEntries={[{ pathname: '/designer/1', state: {} }]}>
        <GamedayProvider>
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </GamedayProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId('gameday-metadata-header')).toBeInTheDocument();
    });

    const addNotification = (useDesignerController as Mock).mock.results[0]?.value.handlers.addNotification as Mock;
    const warningCalls = addNotification.mock.calls.filter(
      (call: unknown[]) => call[2] === 'Migrated with warnings',
    );
    expect(warningCalls).toHaveLength(0);
  });
});
