/**
 * GameTable Component Tests - Expert Mode indicator
 *
 * Verifies the per-row simulated-progression indicator added to GameTable
 * for Expert Mode: only renders when `expertMode` is true, shows the
 * simulated resolved team, and reflects findings via a warning icon.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GameTable from '../GameTable';
import type { GameNode, StageNode, FieldNode, GlobalTeam, HighlightedElement } from '../../../types/flowchart';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../../types/flowchart';
import type { GameProgressionCellResult } from '../../../types/progression';

describe('GameTable - Expert Mode indicator', () => {
  const field1: FieldNode = createFieldNode('field-1', { name: 'Field 1', order: 0 });
  const stage1: StageNode = createStageNode('stage-1', 'field-1', { name: 'Preliminary', category: 'preliminary', order: 0 });
  const game1: GameNode = createGameNodeInStage('game-1', 'stage-1', {
    standing: 'Game 1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
  });
  const team1: GlobalTeam = { id: 'team-1', label: 'Team A', groupId: null, order: 0 };
  const team2: GlobalTeam = { id: 'team-2', label: 'Team B', groupId: null, order: 1 };

  const noop = vi.fn();
  const noopHighlight = vi.fn() as (id: string, type: HighlightedElement['type']) => void;

  const baseProps = {
    games: [game1],
    edges: [],
    allNodes: [field1, stage1, game1],
    globalTeams: [team1, team2],
    globalTeamGroups: [],
    onUpdate: noop,
    onDelete: noop,
    onSelectNode: noop,
    selectedNodeId: null,
    onHighlightElement: noopHighlight,
    onSwapTeams: noop,
    onOpenResultModal: noop,
    onAssignTeam: noop,
    highlightedSourceGameId: null,
    onDynamicReferenceClick: noop,
    onAddGameToGameEdge: noop,
    onAddStageToGameEdge: noop,
    onRemoveEdgeFromSlot: noop,
  };

  it('does not render the indicator when expertMode is false', () => {
    render(<GameTable {...baseProps} expertMode={false} />);
    expect(screen.queryByTestId('expert-mode-indicator-game-1-home')).not.toBeInTheDocument();
  });

  it('does not render the indicator when expertMode is true but no progression data is provided', () => {
    render(<GameTable {...baseProps} expertMode />);
    expect(screen.queryByTestId('expert-mode-indicator-game-1-home')).not.toBeInTheDocument();
  });

  it('shows the simulated resolved team with an ok icon when clean', () => {
    const progressionByGameId = new Map<string, GameProgressionCellResult>([
      [
        'game-1',
        {
          gameId: 'game-1',
          home: { teamLabel: 'Team A', basis: 'actual' },
          away: { teamLabel: 'Team B', basis: 'actual' },
          official: { teamLabel: null, basis: null },
          findings: [],
        },
      ],
    ]);

    render(<GameTable {...baseProps} expertMode progressionByGameId={progressionByGameId} />);

    const homeIndicator = screen.getByTestId('expert-mode-indicator-game-1-home');
    expect(homeIndicator).toHaveTextContent('Team A');
    expect(homeIndicator.querySelector('.bi-check-circle-fill')).toBeInTheDocument();
  });

  it('styles a projected (hypothetical) resolution differently from an actual one', () => {
    const progressionByGameId = new Map<string, GameProgressionCellResult>([
      [
        'game-1',
        {
          gameId: 'game-1',
          home: { teamLabel: 'Team A', basis: 'projected' },
          away: { teamLabel: 'Team B', basis: 'actual' },
          official: { teamLabel: null, basis: null },
          findings: [],
        },
      ],
    ]);

    render(<GameTable {...baseProps} expertMode progressionByGameId={progressionByGameId} />);

    const homeIndicator = screen.getByTestId('expert-mode-indicator-game-1-home');
    expect(homeIndicator).toHaveClass('text-muted');
    expect(homeIndicator).not.toHaveAttribute('title', '');
  });

  it('shows a neutral TBD state (no warning icon) when a slot is simply unresolved with no findings', () => {
    const progressionByGameId = new Map<string, GameProgressionCellResult>([
      [
        'game-1',
        {
          gameId: 'game-1',
          home: { teamLabel: null, basis: null },
          away: { teamLabel: 'Team B', basis: 'actual' },
          official: { teamLabel: null, basis: null },
          findings: [],
        },
      ],
    ]);

    render(<GameTable {...baseProps} expertMode progressionByGameId={progressionByGameId} />);

    const homeIndicator = screen.getByTestId('expert-mode-indicator-game-1-home');
    expect(homeIndicator.querySelector('.bi-info-circle-fill')).toBeInTheDocument();
    expect(homeIndicator.querySelector('.bi-exclamation-triangle-fill')).not.toBeInTheDocument();
  });

  it('shows a warning icon when the cell has findings', () => {
    const progressionByGameId = new Map<string, GameProgressionCellResult>([
      [
        'game-1',
        {
          gameId: 'game-1',
          home: { teamLabel: null, basis: null },
          away: { teamLabel: 'Team B', basis: 'actual' },
          official: { teamLabel: null, basis: null },
          findings: [
            {
              id: 'f1',
              type: 'dangling_reference',
              message: 'dangling!',
              affectedNodes: ['game-1'],
            },
          ],
        },
      ],
    ]);

    render(<GameTable {...baseProps} expertMode progressionByGameId={progressionByGameId} />);

    const homeIndicator = screen.getByTestId('expert-mode-indicator-game-1-home');
    expect(homeIndicator.querySelector('.bi-exclamation-triangle-fill')).toBeInTheDocument();
    expect(homeIndicator).toHaveAttribute('title', 'dangling!');
  });

  it('translates a finding via its messageKey rather than showing the raw fallback message', () => {
    const progressionByGameId = new Map<string, GameProgressionCellResult>([
      [
        'game-1',
        {
          gameId: 'game-1',
          home: { teamLabel: null, basis: null },
          away: { teamLabel: 'Team B', basis: 'actual' },
          official: { teamLabel: null, basis: null },
          findings: [
            {
              id: 'f1',
              type: 'undecided_tie',
              message: 'untranslated fallback text',
              messageKey: 'undecided_tie',
              messageParams: { game: 'Game 1' },
              affectedNodes: ['game-1'],
            },
          ],
        },
      ],
    ]);

    render(<GameTable {...baseProps} expertMode progressionByGameId={progressionByGameId} />);

    const homeIndicator = screen.getByTestId('expert-mode-indicator-game-1-home');
    expect(homeIndicator).toHaveAttribute('title', expect.stringContaining('Game 1'));
    expect(homeIndicator.getAttribute('title')).not.toBe('untranslated fallback text');
  });
});
