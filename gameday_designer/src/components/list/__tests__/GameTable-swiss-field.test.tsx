/**
 * GameTable Swiss assigned-field badge (#1970, option a).
 *
 * Swiss Round Stages hang under Feld 1 while each game carries its own
 * assigned field (`data.fieldId`, e.g. 'swiss-field-2'). The table shows
 * the assigned FIELD NAME as a read-only badge so organizers see where
 * games actually play. No editing — backend owns allocation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GameTable from '../GameTable';
import { GamedayProvider } from '../../../context/GamedayContext';
import i18n from '../../../i18n/testConfig';
import type { FlowNode, GameNode, HighlightedElement } from '../../../types/flowchart';
import type { NotificationType } from '../../../types/designer';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../../types/flowchart';

describe('GameTable swiss assigned-field badge', () => {
  let mockOnUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  let mockOnDelete: (nodeId: string) => void;
  let mockOnSelectNode: (nodeId: string | null) => void;
  let mockOnHighlightElement: (id: string, type: HighlightedElement['type']) => void;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    mockOnUpdate = vi.fn();
    mockOnDelete = vi.fn();
    mockOnSelectNode = vi.fn();
    mockOnHighlightElement = vi.fn();
  });

  const renderSwissTable = (games: GameNode[], allNodes: FlowNode[]) => {
    return render(
      <GamedayProvider>
        <GameTable
          games={games}
          edges={[]}
          allNodes={allNodes}
          globalTeams={[]}
          globalTeamGroups={[]}
          onUpdate={mockOnUpdate}
          onDelete={mockOnDelete}
          onSelectNode={mockOnSelectNode}
          onHighlightElement={mockOnHighlightElement}
          selectedNodeId={null}
          onAssignTeam={vi.fn()}
          onSwapTeams={vi.fn()}
          onAddGameToGameEdge={vi.fn()}
          onAddStageToGameEdge={vi.fn()}
          onRemoveEdgeFromSlot={vi.fn()}
          onOpenResultModal={vi.fn()}
          onDynamicReferenceClick={vi.fn()}
          onNotify={vi.fn() as (message: string, type: NotificationType, title?: string) => void}
        />
      </GamedayProvider>
    );
  };

  it('shows the assigned field name as a read-only badge for a swiss game', () => {
    const field1 = createFieldNode('swiss-field-1', { name: 'Feld 1', order: 0 });
    const field2 = createFieldNode('swiss-field-2', { name: 'Feld 2', order: 1 });
    const stage = createStageNode('swiss-round-1', 'swiss-field-1', {
      name: 'Runde 1',
      category: 'preliminary',
      order: 0,
      progressionMode: 'swiss',
      progressionConfig: { mode: 'swiss', rounds: 4, seedOrder: [], byePoints: 2 },
    });
    const game = createGameNodeInStage('swiss-game-1', 'swiss-round-1', {
      standing: 'S1',
      stage: 'Runde 1',
      fieldId: 'swiss-field-2',
    });

    renderSwissTable([game], [field1, field2, stage, game]);

    const badge = screen.getByTestId('swiss-game-field-swiss-game-1');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Feld 2');
    // Read-only: plain badge, not an input/select
    expect(badge.tagName).not.toBe('SELECT');
    expect(badge.tagName).not.toBe('INPUT');
    expect(badge.querySelector('select, input')).toBeNull();
  });

  it('renders no badge for a game without fieldId (non-Swiss games unchanged)', () => {
    const field1 = createFieldNode('swiss-field-1', { name: 'Feld 1', order: 0 });
    const stage = createStageNode('swiss-round-1', 'swiss-field-1', {
      name: 'Runde 1',
      category: 'preliminary',
      order: 0,
    });
    const game = createGameNodeInStage('plain-game-1', 'swiss-round-1', {
      standing: 'M1',
      stage: 'Runde 1',
    });

    renderSwissTable([game], [field1, stage, game]);

    expect(screen.queryByTestId('swiss-game-field-plain-game-1')).not.toBeInTheDocument();
    // Standing still renders exactly as before
    expect(screen.getByText('M1')).toBeInTheDocument();
  });

  it('renders nothing (no crash, no raw id leak) for an unknown fieldId', () => {
    const field1 = createFieldNode('swiss-field-1', { name: 'Feld 1', order: 0 });
    const stage = createStageNode('swiss-round-1', 'swiss-field-1', {
      name: 'Runde 1',
      category: 'preliminary',
      order: 0,
    });
    const game = createGameNodeInStage('swiss-game-9', 'swiss-round-1', {
      standing: 'S9',
      stage: 'Runde 1',
      fieldId: 'swiss-field-999',
    });

    renderSwissTable([game], [field1, stage, game]);

    expect(screen.queryByTestId('swiss-game-field-swiss-game-9')).not.toBeInTheDocument();
    expect(screen.queryByText('swiss-field-999')).not.toBeInTheDocument();
    expect(screen.getByText('S9')).toBeInTheDocument();
  });
});
