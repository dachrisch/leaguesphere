import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ListDesignerApp from '../ListDesignerApp';
import { useDesignerController } from '../../hooks/useDesignerController';
import { useFlowState } from '../../hooks/useFlowState';
import { designerApi } from '../../api/designerApi';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';
import { FlowNode, FlowEdge, GlobalTeam, GlobalTeamGroup, FlowState } from '../../types/flowchart';

vi.mock('../../hooks/useDesignerController', () => ({
  useDesignerController: vi.fn(),
}));

vi.mock('../../hooks/useFlowState', () => ({
  useFlowState: vi.fn(),
}));

// Capture the onGenerateSwiss prop ListDesignerApp passes down so tests can
// drive handleGenerateSwiss directly, including the display-team payload.
const { swissCapture } = vi.hoisted(() => ({ swissCapture: { fn: null as unknown } }));
vi.mock('../modals/TemplateLibraryModal', () => ({
  default: ({ onGenerateSwiss }: { onGenerateSwiss: unknown }) => {
    swissCapture.fn = onGenerateSwiss;
    return null;
  },
}));

vi.mock('../../api/designerApi', () => ({
  designerApi: {
    setupSwissTournament: vi.fn(),
    generateSwissRound: vi.fn(),
    previewSwissRound: vi.fn(),
  },
}));

vi.mock('../../api/gamedayApi', () => ({
  gamedayApi: {
    getGameday: vi.fn().mockResolvedValue({}),
    getGamedayGames: vi.fn().mockResolvedValue([]),
    updateGameResult: vi.fn().mockResolvedValue({}),
    updateGameResultDetail: vi.fn().mockResolvedValue({}),
    listSeasons: vi.fn().mockResolvedValue([]),
    listLeagues: vi.fn().mockResolvedValue([]),
    getDesignerState: vi.fn().mockResolvedValue({ state_data: null }),
    updateDesignerState: vi.fn().mockResolvedValue({}),
    getTemplates: vi.fn().mockResolvedValue([]),
    saveTemplate: vi.fn(),
    publish: vi.fn().mockResolvedValue({}),
    patchGameday: vi.fn().mockResolvedValue({}),
    deleteGameday: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../trackEvent', () => ({
  trackEvent: vi.fn(),
}));

// Realistic backend PKs (non-sequential) so id-format bugs can't hide
// behind coincidental 1..N fixtures.
const AACHEN: GlobalTeam = { id: '138', label: 'Aachen', groupId: null, order: 0, color: '#e74c3c' };
const ANTWERP: GlobalTeam = { id: '522', label: 'Antwerp', groupId: null, order: 1, color: '#3498db' };

const swissPayload = {
  seedTeamIds: [138, 522],
  rounds: 4,
  fields: 2,
  gameDuration: 30,
  teams: [AACHEN, ANTWERP],
};

describe('ListDesignerApp handleGenerateSwiss (staging gameday 917)', () => {
  const order: string[] = [];
  let pool: GlobalTeam[] = [];

  const mockHandlers = {
    loadData: vi.fn(async () => { order.push('load'); }),
    saveData: vi.fn<(state: FlowState) => Promise<void>>(async () => { order.push('save'); }),
    handleHighlightElement: vi.fn(),
    handleDynamicReferenceClick: vi.fn(),
    handleImport: vi.fn(),
    handleExport: vi.fn(),
    handleClearAll: vi.fn(),
    handleUpdateMetadata: vi.fn(),
    handleUpdateNode: vi.fn(),
    handleDeleteNode: vi.fn(),
    handleAddFieldContainer: vi.fn(),
    handleAddStage: vi.fn(),
    handleSelectNode: vi.fn(),
    handleAddGlobalTeam: vi.fn(),
    handleUpdateGlobalTeam: vi.fn(),
    handleDeleteGlobalTeam: vi.fn(),
    handleReplaceGlobalTeam: vi.fn(),
    handleReorderGlobalTeam: vi.fn(),
    handleUpdateGlobalTeamGroup: vi.fn(),
    handleDeleteGlobalTeamGroup: vi.fn(),
    handleReorderGlobalTeamGroup: vi.fn(),
    handleAssignTeam: vi.fn(),
    handleConnectTeam: vi.fn(),
    handleSwapTeams: vi.fn(),
    handleUpdateGameSlot: vi.fn(),
    handleRemoveEdgeFromSlot: vi.fn(),
    handleGenerateTournament: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleAddGlobalTeamGroup: vi.fn(),
    handleAddOfficialsGroup: vi.fn(),
    handleMoveGame: vi.fn(),
    setShowTournamentModal: vi.fn(),
    dismissNotification: vi.fn(),
    addNotification: vi.fn(),
  };

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
    ui: {
      highlightedElement: null,
      expandedFieldIds: new Set<string>(),
      expandedStageIds: new Set<string>(),
      showTournamentModal: false,
      canExport: true,
      hasData: true,
      isLoading: false,
      notifications: [],
    },
    validation: { isValid: true, errors: [], warnings: [], issueCount: 0 },
    progression: null,
    handlers: mockHandlers,
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    stats: { gameCount: 0, teamCount: 0, fieldCount: 0 },
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    order.length = 0;
    // Aachen already in the canvas pool; Antwerp is missing.
    pool = [{ ...AACHEN }];

    (useFlowState as Mock).mockReturnValue({
      nodes: [] as FlowNode[],
      edges: [] as FlowEdge[],
      globalTeams: pool,
      globalTeamGroups: [] as GlobalTeamGroup[],
      metadata: null,
      swiss: undefined,
      saveTrigger: 0,
      canUndo: false,
      canRedo: false,
      stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
      exportState: vi.fn((): FlowState => ({
        metadata: null as unknown as FlowState['metadata'],
        nodes: [],
        edges: [],
        globalTeams: [...pool],
        globalTeamGroups: [],
        swiss: undefined,
      })),
      importState: vi.fn((state: FlowState) => {
        order.push('import');
        pool.length = 0;
        pool.push(...state.globalTeams);
      }),
    });
    (useDesignerController as Mock).mockReturnValue(defaultMockReturn);
    vi.mocked(designerApi.setupSwissTournament).mockImplementation(async () => {
      order.push('setup');
      return { success: true, config: { seedOrder: [138, 522], rounds: 4, fields: 2, gameDuration: 30, roundStartTimes: {}, completedRounds: [], byes: {} } };
    });
    vi.mocked(designerApi.generateSwissRound).mockImplementation(async () => {
      order.push('generate');
      return { success: true, round: 1, pairings: [], bye_team_id: null, game_ids: [] };
    });

    render(
      <GamedayProvider>
        <MemoryRouter initialEntries={['/designer/1']}>
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </MemoryRouter>
      </GamedayProvider>,
    );
    // Drop the mount-time loadData call so each test observes only the
    // Swiss-apply flow. (mockClear keeps implementations.)
    order.length = 0;
    vi.clearAllMocks();
  });

  const generateSwiss = async (payload = swissPayload) => {
    const fn = swissCapture.fn as (config: typeof payload) => Promise<void>;
    expect(fn).toBeTypeOf('function');
    await act(async () => {
      await fn(payload);
    });
  };

  it('imports missing seed teams into the canvas pool without duplicating existing ones', async () => {
    await generateSwiss();

    const ids = pool.map((t) => t.id);
    expect(ids).toContain('138');
    expect(ids).toContain('522');
    expect(ids.filter((id) => id === '138')).toHaveLength(1);
    expect(pool.find((t) => t.id === '522')).toMatchObject({ label: 'Antwerp', color: '#3498db', order: 1 });
  });

  it('persists the pool BEFORE setupSwissTournament so loadData keeps the teams', async () => {
    await generateSwiss();

    expect(order).toEqual(['import', 'save', 'setup', 'generate', 'load']);
    const savedState = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    expect(savedState.globalTeams.map((t) => t.id).sort()).toEqual(['138', '522']);
    expect(designerApi.setupSwissTournament).toHaveBeenCalledWith(1, {
      seed_team_ids: [138, 522],
      rounds: 4,
      fields: 2,
      game_duration: 30,
    });
  });

  it('aborts the tournament setup when persisting the pool fails', async () => {
    mockHandlers.saveData.mockRejectedValueOnce(new Error('save failed'));

    await generateSwiss();

    expect(designerApi.setupSwissTournament).not.toHaveBeenCalled();
    expect(designerApi.generateSwissRound).not.toHaveBeenCalled();
    expect(mockHandlers.addNotification).toHaveBeenCalled();
  });
});
