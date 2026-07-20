import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ListDesignerApp from '../ListDesignerApp';
import { useDesignerController } from '../../hooks/useDesignerController';
import { useFlowState } from '../../hooks/useFlowState';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GamedayProvider } from '../../context/GamedayContext';
import i18n from '../../i18n/testConfig';
import type { Step } from 'react-joyride';

vi.mock('../../hooks/useDesignerController', () => ({
  useDesignerController: vi.fn(),
}));

vi.mock('../../hooks/useFlowState', () => ({
  useFlowState: vi.fn(),
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

const capturedProps: Record<string, { steps: Step[]; onFinish: () => void }> = {};
vi.mock('../../onboarding/DesignerTour', () => ({
  default: (props: { tourId: string; steps: Step[]; onFinish: () => void }) => {
    capturedProps[props.tourId] = { steps: props.steps, onFinish: props.onFinish };
    return null;
  },
}));

const defaultFlowState = {
  nodes: [],
  edges: [],
  fields: [],
  globalTeams: [],
  globalTeamGroups: [],
  metadata: null,
  saveTrigger: 0,
  canUndo: false,
  canRedo: false,
  stats: { fieldCount: 0, gameCount: 0, teamCount: 0 },
  exportState: vi.fn().mockReturnValue({ nodes: [], edges: [], fields: [], globalTeams: [], globalTeamGroups: [] }),
  importState: vi.fn(),
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
  flowState: {
    nodes: [],
    edges: [],
    fields: [],
    globalTeams: [],
    globalTeamGroups: [],
    exportState: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
  },
  handlers: {
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue({}),
    dismissNotification: vi.fn(),
    addNotification: vi.fn(),
  },
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  stats: { gameCount: 0, teamCount: 0, fieldCount: 0 },
};

describe('ListDesignerApp tour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    for (const key of Object.keys(capturedProps)) delete capturedProps[key];
    localStorage.clear();
    (useFlowState as Mock).mockReturnValue(defaultFlowState);
    (useDesignerController as Mock).mockReturnValue(defaultMockReturn);
  });

  const renderApp = () =>
    render(
      <GamedayProvider>
        <MemoryRouter initialEntries={['/designer/1']}>
          <Routes>
            <Route path="/designer/:id" element={<ListDesignerApp />} />
          </Routes>
        </MemoryRouter>
      </GamedayProvider>
    );

  it('passes the 4 consolidated steps, in order, to the manual_build tour', () => {
    renderApp();
    const steps = capturedProps.manual_build.steps;
    expect(steps.map((s) => s.target)).toEqual([
      '[data-testid="gameday-metadata-header"]',
      '[data-testid="add-team-group-button"]',
      '[data-testid="add-field-button"]',
      '[data-testid="publish-schedule-button"]',
    ]);
  });

  it('clears the resume localStorage key when the manual_build tour finishes', () => {
    localStorage.setItem('gd_tour_manual_build_gameday_id', '1');
    renderApp();
    capturedProps.manual_build.onFinish();
    expect(localStorage.getItem('gd_tour_manual_build_gameday_id')).toBeNull();
  });
});
