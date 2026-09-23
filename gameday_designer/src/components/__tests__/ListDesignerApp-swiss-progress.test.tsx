import { render, act, screen } from '@testing-library/react';
import { describe, it, expect, vi, Mock } from 'vitest';
import ListDesignerApp from '../ListDesignerApp';
import { useDesignerController } from '../../hooks/useDesignerController';
import { useFlowState } from '../../hooks/useFlowState';
import { designerApi } from '../../api/designerApi';
import { gamedayApi } from '../../api/gamedayApi';
import { trackEvent } from '../../trackEvent';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';
import type { FlowNode, GlobalTeam, GlobalTeamGroup, FlowState } from '../../types/flowchart';

vi.mock('../../hooks/useDesignerController', () => ({
  useDesignerController: vi.fn(),
}));

vi.mock('../../hooks/useFlowState', () => ({
  useFlowState: vi.fn(),
}));

const { canvasCapture, templateCapture, adjustCapture, resultModalCapture } = vi.hoisted(() => ({
  canvasCapture: { props: null as unknown },
  templateCapture: { props: null as unknown },
  adjustCapture: { props: null as unknown, calls: 0 },
  resultModalCapture: { props: null as unknown },
}));

vi.mock('../ListCanvas', () => ({
  default: (props: unknown) => {
    canvasCapture.props = props;
    return null;
  },
}));

vi.mock('../modals/TemplateLibraryModal', () => ({
  default: (props: unknown) => {
    templateCapture.props = props;
    return null;
  },
}));

vi.mock('../modals/SwissRoundAdjustModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modals/SwissRoundAdjustModal')>();
  const MockModal = (props: {
    show: boolean;
    onHide: () => void;
    roundNumber: number;
    preview: unknown;
    teamOptions: unknown;
    fieldCount: number;
    onConfirm: (o: unknown) => Promise<void>;
  }) => {
    adjustCapture.props = props;
    adjustCapture.calls += 1;
    return props.show ? <div data-testid="swiss-adjust-modal" /> : null;
  };
  return {
    ...actual,
    default: MockModal,
  };
});

vi.mock('../modals/GameResultModal', () => ({
  default: (props: unknown) => {
    resultModalCapture.props = props;
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

const AACHEN: GlobalTeam = { id: '138', label: 'Aachen', groupId: null, order: 0, color: '#e74c3c' };
const ANTWERP: GlobalTeam = { id: '522', label: 'Antwerp', groupId: null, order: 1, color: '#3498db' };

const previewRound2 = {
  success: true,
  round: 2,
  pairings: [{ home_team_id: 138, away_team_id: 522 }],
  bye_team_id: null,
  game_ids: [],
};

const lastFlowMocks: { exportState?: Mock; importState?: Mock } = {};

const makeFlowState = (
  overrides: Partial<FlowState> & { exportState?: Mock; importState?: Mock } = {},
) => {
  const { exportState, importState, ...rest } = overrides;
  const state = {
    nodes: [] as FlowNode[],
    edges: [],
    globalTeams: [AACHEN, ANTWERP],
    globalTeamGroups: [] as GlobalTeamGroup[],
    metadata: null,
    swiss: {
      seedOrder: [138, 522],
      rounds: 4,
      fields: 2,
      gameDuration: 30,
      roundStartTimes: {},
      completedRounds: [{ round: 1, gameIds: [11], bye: null }],
      byes: {},
    },
    saveTrigger: 0,
    canUndo: false,
    canRedo: false,
    stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
    exportState:
      exportState ??
      vi.fn(() => ({ nodes: [], edges: [], globalTeams: [AACHEN, ANTWERP], globalTeamGroups: [] })),
    importState: importState ?? vi.fn(),
    ...rest,
  };
  lastFlowMocks.exportState = state.exportState as Mock;
  lastFlowMocks.importState = state.importState as Mock;
  return state;
};

const mockHandlers = {
  loadData: vi.fn(async () => {}),
  saveData: vi.fn<(state: FlowState) => Promise<void>>(async () => {}),
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

const controllerReturn = {
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

async function setup(
  flowOverrides: Partial<FlowState> & { exportState?: Mock; importState?: Mock } = {},
  metadataStatus = 'DRAFT',
) {
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
  adjustCapture.calls = 0;
  (useFlowState as Mock).mockReturnValue(makeFlowState(flowOverrides));
  (useDesignerController as Mock).mockReturnValue({
    ...controllerReturn,
    metadata: { ...controllerReturn.metadata, status: metadataStatus },
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
  vi.clearAllMocks();
}

const canvasProps = () => canvasCapture.props as unknown as {
  onProgressSwissRound: (round: number) => Promise<void>;
  onSaveBulkResults: (r: unknown) => Promise<void>;
  swiss: unknown;
  swissGenerating: boolean;
  swissResultsVersion: number;
  onOpenResultModal: (gameId: string) => void;
};

const adjustProps = () => adjustCapture.props as unknown as {
  show: boolean;
  onHide: () => void;
  roundNumber: number;
  preview: typeof previewRound2;
  teamOptions: Array<{ id: number; name: string }>;
  fieldCount: number;
  onConfirm: (o: unknown) => Promise<void>;
};

describe('ListDesignerApp handleProgressSwissRound', () => {
  it('opens the adjust modal on preview success and resets generating', async () => {
    await setup();
    vi.mocked(designerApi.previewSwissRound).mockResolvedValueOnce({ ...previewRound2 });

    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });

    expect(designerApi.previewSwissRound).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();
    expect(adjustProps().roundNumber).toBe(2);
    expect(adjustProps().preview).toEqual(previewRound2);
    expect(adjustProps().teamOptions).toEqual([
      { id: 138, name: 'Aachen' },
      { id: 522, name: 'Antwerp' },
    ]);
    expect(adjustProps().fieldCount).toBe(2);
    expect(canvasProps().swissGenerating).toBe(false);
  });

  it('falls back to the requested round when preview.round is falsy', async () => {
    await setup();
    vi.mocked(designerApi.previewSwissRound).mockResolvedValueOnce({ ...previewRound2, round: 0 });

    await act(async () => {
      await canvasProps().onProgressSwissRound(3);
    });

    expect(adjustProps().roundNumber).toBe(3);
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();
  });

  it('shows the backend error and keeps the modal closed', async () => {
    await setup();
    vi.mocked(designerApi.previewSwissRound).mockRejectedValueOnce({
      response: { data: { error: 'prior round incomplete' } },
    });

    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });

    expect(screen.queryByTestId('swiss-adjust-modal')).toBeNull();
    expect(mockHandlers.addNotification).toHaveBeenCalledWith(
      'prior round incomplete',
      'danger',
      expect.anything(),
    );
    expect(canvasProps().swissGenerating).toBe(false);
  });

  it('falls back to the generic message on non-backend errors', async () => {
    await setup();
    vi.mocked(designerApi.previewSwissRound).mockRejectedValueOnce(new Error('net down'));

    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });

    expect(screen.queryByTestId('swiss-adjust-modal')).toBeNull();
    expect(mockHandlers.addNotification).toHaveBeenCalled();
    const message = vi.mocked(mockHandlers.addNotification).mock.calls[0][0] as string;
    expect(message).not.toBe('net down');
  });
});

describe('ListDesignerApp handleConfirmSwissAdjust', () => {
  const overrides = { pairings: [{ home_team_id: 522, away_team_id: 138 }], bye_team_id: null };

  async function openModal() {
    vi.mocked(designerApi.previewSwissRound).mockResolvedValueOnce({ ...previewRound2 });
    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();
  }

  it('generates with overrides, notifies, closes and reloads', async () => {
    await setup();
    await openModal();
    vi.mocked(designerApi.generateSwissRound).mockResolvedValueOnce({
      success: true,
      round: 2,
      pairings: [],
      bye_team_id: null,
      game_ids: [21],
    });

    await act(async () => {
      await adjustProps().onConfirm(overrides);
    });

    expect(designerApi.generateSwissRound).toHaveBeenCalledWith(1, overrides);
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('swiss_round_generated', { gameday_id: 1, round: 2 });
    expect(mockHandlers.addNotification).toHaveBeenCalled();
    expect(mockHandlers.loadData).toHaveBeenCalled();
    expect(screen.queryByTestId('swiss-adjust-modal')).toBeNull();
  });

  it('notifies and rethrows backend errors so the modal stays open', async () => {
    await setup();
    await openModal();
    const failure = { response: { data: { error: 'bye team also paired' } } };
    vi.mocked(designerApi.generateSwissRound).mockRejectedValueOnce(failure);

    await act(async () => {
      await expect(adjustProps().onConfirm(overrides)).rejects.toBe(failure);
    });

    expect(mockHandlers.addNotification).toHaveBeenCalledWith(
      'bye team also paired',
      'danger',
      expect.anything(),
    );
    expect(mockHandlers.loadData).not.toHaveBeenCalled();
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();
  });

  it('uses the fallback message for generic confirm failures', async () => {
    await setup();
    await openModal();
    vi.mocked(designerApi.generateSwissRound).mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      await expect(adjustProps().onConfirm(overrides)).rejects.toThrow('boom');
    });

    expect(mockHandlers.addNotification).toHaveBeenCalled();
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();
  });

  it('onHide closes the adjust modal', async () => {
    await setup();
    await openModal();

    await act(async () => {
      adjustProps().onHide();
    });

    expect(screen.queryByTestId('swiss-adjust-modal')).toBeNull();
  });
});

describe('ListDesignerApp swiss wiring', () => {
  it('passes swiss state and handlers to ListCanvas and TemplateLibraryModal', async () => {
    await setup();
    const canvas = canvasProps();
    expect(canvas.swiss).toMatchObject({ seedOrder: [138, 522], fields: 2 });
    expect(canvas.swissGenerating).toBe(false);
    expect(canvas.swissResultsVersion).toBe(0);
    expect(canvas.onProgressSwissRound).toBeTypeOf('function');

    const template = templateCapture.props as unknown as {
      onGenerateSwiss: unknown;
      dayStartTime: string;
    };
    expect(template.onGenerateSwiss).toBeTypeOf('function');
    expect(template.dayStartTime).toBe('10:00');
  });

  it('falls back to fieldCount 0 when no swiss config exists', async () => {
    await setup({ swiss: undefined });
    vi.mocked(designerApi.previewSwissRound).mockResolvedValueOnce({ ...previewRound2 });
    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });
    expect(adjustProps().fieldCount).toBe(0);
    // Seed order unknown → team options fall back to Team <id> labels.
    expect(adjustProps().teamOptions).toEqual([]);
  });

  it('bumps swissResultsVersion after a single game result save', async () => {
    const gameNode = {
      id: 'game-1',
      type: 'game',
      position: { x: 0, y: 0 },
      data: { type: 'game', homeTeamId: '138', awayTeamId: '522' },
    } as unknown as FlowNode;
    await setup({ nodes: [gameNode] });
    expect(canvasProps().swissResultsVersion).toBe(0);

    await act(async () => {
      canvasProps().onOpenResultModal('game-1');
    });
    const modal = resultModalCapture.props as unknown as {
      onSave: (data: { halftime_score: { home: number; away: number }; final_score: { home: number; away: number } }) => Promise<void>;
    };
    await act(async () => {
      await modal.onSave({
        halftime_score: { home: 1, away: 0 },
        final_score: { home: 2, away: 0 },
      });
    });

    expect(mockHandlers.handleUpdateNode).toHaveBeenCalled();
    expect(vi.mocked(gamedayApi.updateGameResult)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ halftime_score: { home: 1, away: 0 } }),
    );
    expect(canvasProps().swissResultsVersion).toBe(1);
  });

  it('bumps swissResultsVersion after bulk results save', async () => {
    await setup();
    vi.mocked(gamedayApi.getGamedayGames).mockResolvedValueOnce([]);
    await act(async () => {
      await canvasProps().onSaveBulkResults({});
    });
    expect(canvasProps().swissResultsVersion).toBe(1);
  });
});

describe('ListDesignerApp handleGenerateSwiss error branches', () => {
  const payload = {
    seedTeamIds: [138, 522],
    rounds: 4,
    fields: 2,
    gameDuration: 30,
    teams: [AACHEN, ANTWERP],
  };

  async function generateSwiss(config = payload) {
    const template = templateCapture.props as unknown as {
      onGenerateSwiss: (c: typeof config) => Promise<void>;
    };
    await act(async () => {
      await template.onGenerateSwiss(config);
    });
  }

  it('persists without import when no teams are provided', async () => {
    await setup({ globalTeams: [] });
    vi.mocked(designerApi.setupSwissTournament).mockResolvedValueOnce({ success: true, config: {} as never });
    vi.mocked(designerApi.generateSwissRound).mockResolvedValueOnce({
      success: true,
      round: 1,
      pairings: [],
      bye_team_id: null,
      game_ids: [],
    });

    await generateSwiss({ ...payload, teams: [] });

    expect(mockHandlers.saveData).toHaveBeenCalledTimes(1);
    expect(designerApi.setupSwissTournament).toHaveBeenCalledWith(1, {
      seed_team_ids: [138, 522],
      rounds: 4,
      fields: 2,
      game_duration: 30,
    });
    expect(mockHandlers.loadData).toHaveBeenCalled();
  });

  it('shows the backend error when setup fails and skips generate', async () => {
    await setup({ globalTeams: [] });
    vi.mocked(designerApi.setupSwissTournament).mockRejectedValueOnce({
      response: { data: { error: 'already has generated rounds' } },
    });

    await generateSwiss({ ...payload, teams: [] });

    expect(designerApi.generateSwissRound).not.toHaveBeenCalled();
    expect(mockHandlers.loadData).not.toHaveBeenCalled();
    expect(mockHandlers.addNotification).toHaveBeenCalledWith(
      'already has generated rounds',
      'danger',
      expect.anything(),
    );
  });

  it('shows the backend error when round-1 generate fails', async () => {
    await setup({ globalTeams: [] });
    vi.mocked(designerApi.setupSwissTournament).mockResolvedValueOnce({ success: true, config: {} as never });
    vi.mocked(designerApi.generateSwissRound).mockRejectedValueOnce({
      response: { data: { error: 'gelost' } },
    });

    await generateSwiss({ ...payload, teams: [] });

    expect(mockHandlers.loadData).not.toHaveBeenCalled();
    expect(mockHandlers.addNotification).toHaveBeenCalledWith('gelost', 'danger', expect.anything());
  });
});

describe('ListDesignerApp Swiss progression when published', () => {
  const gameNode = {
    id: 'game-7',
    type: 'game',
    position: { x: 0, y: 0 },
    data: { type: 'game', homeTeamId: '138', awayTeamId: '522' },
  } as unknown as FlowNode;

  const saveResult = async () => {
    await act(async () => {
      canvasProps().onOpenResultModal('game-7');
    });
    const modal = resultModalCapture.props as unknown as {
      onSave: (data: { halftime_score: { home: number; away: number }; final_score: { home: number; away: number } }) => Promise<void>;
    };
    await act(async () => {
      await modal.onSave({
        halftime_score: { home: 1, away: 0 },
        final_score: { home: 2, away: 0 },
      });
    });
  };

  it('progresses rounds when published: preview opens the modal and confirm generates', async () => {
    await setup({}, 'PUBLISHED');
    vi.mocked(designerApi.previewSwissRound).mockResolvedValueOnce({ ...previewRound2 });
    await act(async () => {
      await canvasProps().onProgressSwissRound(2);
    });
    expect(screen.getByTestId('swiss-adjust-modal')).toBeTruthy();

    vi.mocked(designerApi.generateSwissRound).mockResolvedValueOnce({
      success: true,
      round: 2,
      pairings: [],
      bye_team_id: null,
      game_ids: [21],
    });
    const overrides = { pairings: [{ home_team_id: 522, away_team_id: 138 }], bye_team_id: null };
    await act(async () => {
      await adjustProps().onConfirm(overrides);
    });

    expect(designerApi.generateSwissRound).toHaveBeenCalledWith(1, overrides);
    expect(mockHandlers.loadData).toHaveBeenCalled();
    expect(screen.queryByTestId('swiss-adjust-modal')).toBeNull();
  });

  it('persists node scores explicitly when published (auto-save is locked)', async () => {
    const exportState = vi.fn(() => ({
      nodes: [gameNode],
      edges: [],
      globalTeams: [AACHEN, ANTWERP],
      globalTeamGroups: [],
    }));
    await setup({ nodes: [gameNode], exportState }, 'PUBLISHED');
    expect(canvasProps().swissResultsVersion).toBe(0);

    await saveResult();

    // In-memory node update + Gameinfo write + explicit canvas persist.
    expect(mockHandlers.handleUpdateNode).toHaveBeenCalledWith(
      'game-7',
      expect.objectContaining({ final_score: { home: 2, away: 0 } }),
    );
    expect(mockHandlers.saveData).toHaveBeenCalledTimes(1);
    const saved = mockHandlers.saveData.mock.calls[0][0] as FlowState;
    const savedGame = saved.nodes.find((n) => n.id === 'game-7') as unknown as {
      data: { final_score: { home: number; away: number } };
    };
    expect(savedGame.data.final_score).toEqual({ home: 2, away: 0 });
    expect(canvasProps().swissResultsVersion).toBe(1);
  });

  it('reports explicit failure when the canvas persist fails after Gameinfo success', async () => {
    await setup({ nodes: [gameNode] }, 'PUBLISHED');
    mockHandlers.saveData.mockRejectedValueOnce(new Error('persist failed'));

    await saveResult();

    // Gameinfo write happened, but the user sees failure (not silent success):
    // modal stays open, no version bump, no success toast.
    expect(vi.mocked(gamedayApi.updateGameResult)).toHaveBeenCalled();
    expect(mockHandlers.addNotification).toHaveBeenCalledWith(
      expect.anything(),
      'danger',
      expect.anything(),
    );
    const kinds = vi.mocked(mockHandlers.addNotification).mock.calls.map((c) => c[1]);
    expect(kinds).not.toContain('success');
    expect(canvasProps().swissResultsVersion).toBe(0);
  });

  it('surfaces the draft-only backend error when generating setup while published', async () => {
    await setup({ globalTeams: [] }, 'PUBLISHED');
    vi.mocked(designerApi.setupSwissTournament).mockRejectedValueOnce({
      response: { data: { error: 'Swiss setup is only available in draft status' } },
    });
    const template = templateCapture.props as unknown as {
      onGenerateSwiss: (c: unknown) => Promise<void>;
    };

    await act(async () => {
      await template.onGenerateSwiss({
        seedTeamIds: [138, 522],
        rounds: 4,
        fields: 2,
        gameDuration: 30,
        teams: [],
      });
    });

    expect(designerApi.generateSwissRound).not.toHaveBeenCalled();
    expect(mockHandlers.addNotification).toHaveBeenCalledWith(
      'Swiss setup is only available in draft status',
      'danger',
      expect.anything(),
    );
  });
});
