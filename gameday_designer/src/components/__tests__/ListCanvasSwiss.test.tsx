/**
 * ListCanvas Swiss embedded-standings tests (Task 7, TDD RED phase).
 *
 * When flowState.swiss exists the designer canvas shows the embedded
 * standings panel; with no swiss config there is no panel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ListCanvas from '../ListCanvas';
import type { ListCanvasProps } from '../ListCanvas';
import { GamedayProvider } from '../../context/GamedayContext';
import { designerApi } from '../../api/designerApi';
import i18n from '../../i18n/testConfig';
import type {
  GamedayMetadata,
  FlowValidationResult,
  SwissTournamentState,
} from '../../types/flowchart';

const SWISS: SwissTournamentState = {
  seedOrder: [1, 2, 3, 4],
  rounds: 3,
  fields: 2,
  gameDuration: 30,
  roundStartTimes: { '1': '09:00', '2': '10:00', '3': '11:00' },
  completedRounds: [{ round: 1, gameIds: [101], bye: null }],
  byes: {},
};

const createProps = (overrides: Partial<ListCanvasProps> = {}): ListCanvasProps => ({
  gamedayId: 42,
  nodes: [],
  edges: [],
  globalTeams: [],
  globalTeamGroups: [],
  onUpdateNode: vi.fn(),
  onDeleteNode: vi.fn(),
  onAddStage: vi.fn(),
  onSelectNode: vi.fn(),
  selectedNodeId: null,
  onAddGlobalTeam: vi.fn(),
  onUpdateGlobalTeam: vi.fn(),
  onDeleteGlobalTeam: vi.fn(),
  onReorderGlobalTeam: vi.fn(),
  onAddGlobalTeamGroup: vi.fn(),
  onUpdateGlobalTeamGroup: vi.fn(),
  onDeleteGlobalTeamGroup: vi.fn(),
  onReorderGlobalTeamGroup: vi.fn(),
  getTeamUsage: vi.fn(() => [] as { gameId: string; slot: 'home' | 'away' }[]),
  onAssignTeam: vi.fn(),
  onAddGame: vi.fn(),
  onAddField: vi.fn(),
  highlightedElement: null,
  onDynamicReferenceClick: vi.fn(),
  onAddGameToGameEdge: vi.fn(),
  onAddStageToGameEdge: vi.fn(),
  onRemoveEdgeFromSlot: vi.fn(),
  expandedFieldIds: new Set(),
  expandedStageIds: new Set(),
  onNotify: vi.fn(),
  onHighlightElement: vi.fn(),
  onShowTeamSelection: vi.fn(),
  onSwapTeams: vi.fn(),
  onOpenResultModal: vi.fn(),
  readOnly: false,
  highlightedSourceGameId: null,
  metadata: {
    id: 42,
    name: 'Swiss Gameday',
    date: '2025-01-01',
    start: '09:00',
    format: 'tournament',
    author: 1,
    address: 'Test Venue',
    season: 1,
    league: 1,
    status: 'DRAFT',
  } as GamedayMetadata,
  onUpdateMetadata: vi.fn(),
  onClearAll: vi.fn(),
  onDeleteGameday: vi.fn(),
  onPublishGameday: vi.fn(),
  onUnlockGameday: vi.fn(() => Promise.resolve()),
  validation: {
    isValid: true,
    errors: [],
    warnings: [],
  } as FlowValidationResult,
  isRowCollapsed: false,
  ...overrides,
});

const renderCanvas = (props: ListCanvasProps) => {
  return render(
    <GamedayProvider>
      <ListCanvas {...props} />
    </GamedayProvider>,
  );
};

describe('ListCanvas Swiss embedded standings', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue({
      standings: [
        {
          team_id: 11, team_name: 'Alpha', seed: 0, played: 1, wins: 1,
          draws: 0, losses: 0, points_for: 10, points_against: 5, byes: 0, points: 2,
        },
      ],
      rounds_completed: 1,
      rounds_total: 3,
    });
  });

  it('shows the embedded standings panel with table rows when swiss config exists', async () => {
    renderCanvas(createProps({ swiss: SWISS }));

    expect(await screen.findByTestId('swiss-standings-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-standing-11')).toHaveTextContent('Alpha');
    expect(await screen.findByTestId('swiss-rounds-indicator')).toBeInTheDocument();
  });

  it('shows no standings panel when there is no swiss config', () => {
    renderCanvas(createProps({ swiss: undefined }));

    expect(screen.queryByTestId('swiss-standings-panel')).not.toBeInTheDocument();
    expect(designerApi.getSwissStandings).not.toHaveBeenCalled();
  });

  it('renders the standings panel inside a sticky side callout below the header row', async () => {
    renderCanvas(createProps({ swiss: SWISS }));

    const callout = await screen.findByTestId('swiss-side-callout');
    expect(callout).toBeInTheDocument();
    expect(within(callout).getByTestId('swiss-standings-panel')).toBeInTheDocument();
    // Header (metadata + team pool row) stays above the side callout.
    const header = screen.getByTestId('gameday-metadata-header');
    expect(header.compareDocumentPosition(callout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no side callout when there is no swiss config', () => {
    renderCanvas(createProps({ swiss: undefined }));

    expect(screen.queryByTestId('swiss-side-callout')).not.toBeInTheDocument();
  });

  it('refetches standings when results are saved without a new round (results version bump)', async () => {
    const { rerender } = render(
      <GamedayProvider>
        <ListCanvas {...createProps({ swiss: SWISS })} swissResultsVersion={0} />
      </GamedayProvider>,
    );

    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(designerApi.getSwissStandings).toHaveBeenCalledTimes(1);

    rerender(
      <GamedayProvider>
        <ListCanvas {...createProps({ swiss: SWISS })} swissResultsVersion={1} />
      </GamedayProvider>,
    );

    await waitFor(() => expect(designerApi.getSwissStandings).toHaveBeenCalledTimes(2));
  });

  it('renders the standings panel when completedRounds is missing (defensive refreshKey)', async () => {
    const legacySwiss = { ...SWISS, completedRounds: undefined } as unknown as SwissTournamentState;
    renderCanvas(createProps({ swiss: legacySwiss }));

    expect(await screen.findByTestId('swiss-standings-panel')).toBeInTheDocument();
  });

  it('wires the panel generate button to onProgressSwissRound with the next round', async () => {
    const onProgressSwissRound = vi.fn();
    renderCanvas(createProps({ swiss: SWISS, onProgressSwissRound }));

    const button = await screen.findByTestId('swiss-generate-next');
    expect(button).toHaveTextContent('Generate Round 2');
    fireEvent.click(button);
    expect(onProgressSwissRound).toHaveBeenCalledWith(2);
  });

  it('forwards the generating state to the panel button', async () => {
    renderCanvas(createProps({ swiss: SWISS, onProgressSwissRound: vi.fn(), swissGenerating: true }));

    expect(await screen.findByTestId('swiss-generate-next')).toBeDisabled();
  });

  it('shows no panel generate button in readOnly mode', async () => {
    renderCanvas(createProps({ swiss: SWISS, onProgressSwissRound: vi.fn(), readOnly: true }));

    expect(await screen.findByTestId('swiss-standings-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('swiss-generate-next')).not.toBeInTheDocument();
  });
});
