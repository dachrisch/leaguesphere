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

    // Snapshot-based export mock: captures a FROZEN copy of the pre-import
    // pool once. A stale same-tick re-export after importState() therefore
    // does NOT see the import (mirrors React async setState), so a test
    // asserting on saved content FAILS on the stale pattern and passes only
    // when saveData receives the merged object directly.
    const frozenSnapshot: FlowState = Object.freeze({
      metadata: null as unknown as FlowState['metadata'],
      nodes: [],
      edges: [],
      globalTeams: Object.freeze([{ ...AACHEN }]) as unknown as FlowState['globalTeams'],
      globalTeamGroups: [],
      swiss: undefined,
    } as FlowState);
    const flowExportState = vi.fn((): FlowState => frozenSnapshot);
    const flowImportState = vi.fn((state: FlowState) => {
      order.push('import');
      pool.length = 0;
      pool.push(...state.globalTeams);
    });
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
      exportState: flowExportState,
      importState: flowImportState,
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
    // Content assertion (not just call order): the saved pool must contain
    // the newly imported team. With a snapshot-frozen export mock, the stale
    // import-then-re-export pattern would save the team-less snapshot and
    // fail here.
    expect(savedState.globalTeams.map((t) => t.id).sort()).toEqual(['138', '522']);
    expect(savedState.globalTeams.find((t) => t.id === '522')).toMatchObject({
      label: 'Antwerp',
      color: '#3498db',
      order: 1,
    });
    // The merged state object is built ONCE and shared by import + save.
    const flowMock = vi.mocked(useFlowState).mock.results[0].value as {
      exportState: Mock;
      importState: Mock;
    };
    expect(flowMock.exportState).toHaveBeenCalledTimes(1);
    expect(flowMock.importState).toHaveBeenCalledTimes(1);
    expect(mockHandlers.saveData.mock.calls[0][0]).toBe(
      flowMock.importState.mock.calls[0][0],
    );
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

// Six realistic league PKs (non-sequential) so id-format bugs can't hide.
const SEEDS: GlobalTeam[] = [
  { id: '138', label: 'Aachen', groupId: null, order: 0, color: '#e74c3c' },
  { id: '522', label: 'Antwerp', groupId: null, order: 1, color: '#3498db' },
  { id: '907', label: 'Bremen', groupId: null, order: 2, color: '#2ecc71' },
  { id: '41', label: 'Dortmund', groupId: null, order: 3, color: '#f39c12' },
  { id: '1660', label: 'Essen', groupId: null, order: 4, color: '#9b59b6' },
  { id: '73', label: 'Freiburg', groupId: null, order: 5, color: '#1abc9c' },
];

const sixSeedPayload = {
  seedTeamIds: [138, 522, 907, 41, 1660, 73],
  rounds: 4,
  fields: 2,
  gameDuration: 30,
  teams: SEEDS,
};

describe('ListDesignerApp handleGenerateSwiss pool group (group-swiss)', () => {
  const order: string[] = [];
  let pool: GlobalTeam[] = [];
  let poolGroups: GlobalTeamGroup[] = [];

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

  const setupHarness = async (initialTeams: GlobalTeam[], initialGroups: GlobalTeamGroup[]) => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    order.length = 0;
    pool = initialTeams.map((t) => ({ ...t }));
    poolGroups = initialGroups.map((g) => ({ ...g }));

    const frozenSnapshot: FlowState = Object.freeze({
      metadata: null as unknown as FlowState['metadata'],
      nodes: [],
      edges: [],
      globalTeams: Object.freeze(pool.map((t) => ({ ...t }))) as unknown as FlowState['globalTeams'],
      globalTeamGroups: Object.freeze(poolGroups.map((g) => ({ ...g }))) as unknown as FlowState['globalTeamGroups'],
      swiss: undefined,
    } as FlowState);
    const flowExportState = vi.fn((): FlowState => frozenSnapshot);
    const flowImportState = vi.fn((state: FlowState) => {
      order.push('import');
      pool.length = 0;
      pool.push(...state.globalTeams);
      poolGroups.length = 0;
      poolGroups.push(...(state.globalTeamGroups ?? []));
    });
    (useFlowState as Mock).mockReturnValue({
      nodes: [] as FlowNode[],
      edges: [] as FlowEdge[],
      globalTeams: pool,
      globalTeamGroups: poolGroups,
      metadata: null,
      swiss: undefined,
      saveTrigger: 0,
      canUndo: false,
      canRedo: false,
      stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
      exportState: flowExportState,
      importState: flowImportState,
    });
    (useDesignerController as Mock).mockReturnValue(defaultMockReturn);
    vi.mocked(designerApi.setupSwissTournament).mockImplementation(async () => {
      order.push('setup');
      return { success: true, config: { seedOrder: [138], rounds: 4, fields: 2, gameDuration: 30, roundStartTimes: {}, completedRounds: [], byes: {} } };
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
    order.length = 0;
    vi.clearAllMocks();
  };

  const generateSwiss = async (payload = sixSeedPayload) => {
    const fn = swissCapture.fn as (config: typeof payload) => Promise<void>;
    expect(fn).toBeTypeOf('function');
    await act(async () => {
      await fn(payload);
    });
  };

  it('creates group-swiss on an empty pool and assigns all 6 seeds to it', async () => {
    await setupHarness([], []);
    await generateSwiss();

    expect(order).toEqual(['import', 'save', 'setup', 'generate', 'load']);
    const savedState = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    expect(savedState.globalTeamGroups).toHaveLength(1);
    expect(savedState.globalTeamGroups[0]).toMatchObject({ id: 'group-swiss', name: 'Teams', order: 0 });
    expect(savedState.globalTeams.map((t) => t.id).sort()).toEqual(
      ['138', '1660', '41', '522', '73', '907'].sort(),
    );
    for (const team of savedState.globalTeams) {
      expect(team.groupId).toBe('group-swiss');
    }
    // The merged state object is built ONCE and shared by import + save.
    const flowMock = vi.mocked(useFlowState).mock.results[0].value as {
      exportState: Mock;
      importState: Mock;
    };
    expect(mockHandlers.saveData.mock.calls[0][0]).toBe(
      flowMock.importState.mock.calls[0][0],
    );
    expect(pool.map((t) => t.id).sort()).toEqual(
      ['138', '1660', '41', '522', '73', '907'].sort(),
    );
  });

  it('re-apply before Round 1 does not duplicate group-swiss', async () => {
    const grouped = SEEDS.map((t) => ({ ...t, groupId: 'group-swiss' }));
    await setupHarness(grouped, [{ id: 'group-swiss', name: 'Teams', order: 0 }]);
    await generateSwiss();

    // All seeds already present: no merge, the persisted snapshot still
    // carries exactly one group-swiss.
    const savedState = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    expect(savedState.globalTeamGroups).toHaveLength(1);
    expect(savedState.globalTeamGroups[0]).toMatchObject({ id: 'group-swiss' });
    const flowMock = vi.mocked(useFlowState).mock.results[0].value as {
      exportState: Mock;
      importState: Mock;
    };
    expect(flowMock.importState).not.toHaveBeenCalled();
  });

  it('reuses an existing group-swiss for newly missing seeds', async () => {
    await setupHarness(
      [{ ...SEEDS[0], groupId: 'group-swiss' }],
      [{ id: 'group-swiss', name: 'Teams', order: 0 }],
    );
    await generateSwiss({ ...sixSeedPayload, seedTeamIds: [138, 522], teams: [SEEDS[0], SEEDS[1]] });

    const savedState = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    expect(savedState.globalTeamGroups).toHaveLength(1);
    expect(savedState.globalTeamGroups[0]).toMatchObject({ id: 'group-swiss' });
    expect(savedState.globalTeams.find((t) => t.id === '522')).toMatchObject({
      label: 'Antwerp',
      groupId: 'group-swiss',
    });
    expect(savedState.globalTeams.find((t) => t.id === '138')).toMatchObject({
      groupId: 'group-swiss',
    });
  });

  it('leaves user groups untouched and keeps missing seeds ungrouped', async () => {
    await setupHarness(
      [{ id: '99', label: 'Reserve', groupId: 'g1', order: 0 }],
      [{ id: 'g1', name: 'Gruppe A', order: 0 }],
    );
    await generateSwiss({ ...sixSeedPayload, seedTeamIds: [138, 522], teams: [SEEDS[0], SEEDS[1]] });

    const savedState = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    expect(savedState.globalTeamGroups).toEqual([{ id: 'g1', name: 'Gruppe A', order: 0 }]);
    expect(savedState.globalTeams.find((t) => t.id === '138')).toMatchObject({ groupId: null });
    expect(savedState.globalTeams.find((t) => t.id === '522')).toMatchObject({ groupId: null });
    expect(savedState.globalTeams.find((t) => t.id === '99')).toMatchObject({ groupId: 'g1' });
  });
});
