import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StagesOverviewPanel from '../StagesOverviewPanel';
import type { GlobalTeam, HighlightedElement } from '../../types/flowchart';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../types/flowchart';

describe('StagesOverviewPanel', () => {
  const onHighlightElement = vi.fn() as (id: string, type: HighlightedElement['type']) => void;

  it('renders nothing when there are no stages', () => {
    const { container } = render(
      <StagesOverviewPanel nodes={[]} globalTeams={[]} onHighlightElement={onHighlightElement} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default -- stage/team names are not in the DOM until expanded', () => {
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stage = createStageNode('s1', 'f1', { name: 'Preliminary', order: 0 });
    const game = createGameNodeInStage('g1', 's1', { standing: 'Game 1', homeTeamId: 't1', awayTeamId: 't2' });
    const globalTeams: GlobalTeam[] = [
      { id: 't1', label: 'Team A', groupId: null, order: 0 },
      { id: 't2', label: 'Team B', groupId: null, order: 1 },
    ];

    render(
      <StagesOverviewPanel
        nodes={[field, stage, game]}
        globalTeams={globalTeams}
        onHighlightElement={onHighlightElement}
      />
    );

    expect(screen.getByTestId('stages-overview-count')).toHaveTextContent('1');
    expect(screen.queryByText('Preliminary')).not.toBeInTheDocument();
    expect(screen.queryByText(/Team A/)).not.toBeInTheDocument();
  });

  it('shows the stage, its field and resolved team labels once expanded', async () => {
    const user = userEvent.setup();
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stage = createStageNode('s1', 'f1', { name: 'Preliminary', order: 0 });
    const game = createGameNodeInStage('g1', 's1', { standing: 'Game 1', homeTeamId: 't1', awayTeamId: 't2' });
    const globalTeams: GlobalTeam[] = [
      { id: 't1', label: 'Team A', groupId: null, order: 0 },
      { id: 't2', label: 'Team B', groupId: null, order: 1 },
    ];

    render(
      <StagesOverviewPanel
        nodes={[field, stage, game]}
        globalTeams={globalTeams}
        onHighlightElement={onHighlightElement}
      />
    );

    await user.click(screen.getByText('Stages Overview'));

    expect(screen.getByText('Preliminary')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
    expect(screen.getByTestId('stages-overview-s1')).toHaveTextContent('Team A');
    expect(screen.getByTestId('stages-overview-s1')).toHaveTextContent('Team B');
  });

  it('resolves a dynamic team reference to its formatted label', async () => {
    const user = userEvent.setup();
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stage = createStageNode('s1', 'f1', { name: 'Final', order: 0 });
    const game = createGameNodeInStage('g1', 's1', {
      standing: 'Final',
      homeTeamDynamic: { type: 'winner', matchName: 'HF1' },
      awayTeamDynamic: { type: 'winner', matchName: 'HF2' },
    });

    render(
      <StagesOverviewPanel nodes={[field, stage, game]} globalTeams={[]} onHighlightElement={onHighlightElement} />
    );
    await user.click(screen.getByText('Stages Overview'));

    expect(screen.getByTestId('stages-overview-s1')).toHaveTextContent('Gewinner HF1');
    expect(screen.getByTestId('stages-overview-s1')).toHaveTextContent('Gewinner HF2');
  });

  it('shows all field names for a stage spanning multiple fields, with every field\'s games combined', async () => {
    const user = userEvent.setup();
    const field1 = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const field2 = createFieldNode('f2', { name: 'Field 2', order: 1 });
    const stage = createStageNode('s1', 'f1', { name: 'Platzierung', order: 0, fieldIds: ['f1', 'f2'] });
    const gameOnField1 = createGameNodeInStage('g1', 's1', { standing: 'G1', homeTeamId: 't1', awayTeamId: 't2' });
    const gameOnField2 = createGameNodeInStage('g2', 's1', { standing: 'G2', fieldId: 'f2', homeTeamId: 't3', awayTeamId: 't4' });
    const globalTeams: GlobalTeam[] = [
      { id: 't1', label: 'Team A', groupId: null, order: 0 },
      { id: 't2', label: 'Team B', groupId: null, order: 1 },
      { id: 't3', label: 'Team C', groupId: null, order: 2 },
      { id: 't4', label: 'Team D', groupId: null, order: 3 },
    ];

    render(
      <StagesOverviewPanel
        nodes={[field1, field2, stage, gameOnField1, gameOnField2]}
        globalTeams={globalTeams}
        onHighlightElement={onHighlightElement}
      />
    );
    await user.click(screen.getByText('Stages Overview'));

    const row = screen.getByTestId('stages-overview-s1');
    expect(row).toHaveTextContent('Field 1, Field 2');
    // One combined table -- teams from both fields' games show together.
    expect(row).toHaveTextContent('Team A');
    expect(row).toHaveTextContent('Team C');
    expect(row).toHaveTextContent('2 games');
  });

  it('shows a placeholder when a stage has no teams assigned yet', async () => {
    const user = userEvent.setup();
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stage = createStageNode('s1', 'f1', { name: 'Empty Stage', order: 0 });

    render(
      <StagesOverviewPanel nodes={[field, stage]} globalTeams={[]} onHighlightElement={onHighlightElement} />
    );
    await user.click(screen.getByText('Stages Overview'));

    expect(screen.getByTestId('stages-overview-s1')).toHaveTextContent('No teams assigned yet');
  });

  it('calls onHighlightElement with the stage id when a row is clicked', async () => {
    const user = userEvent.setup();
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stage = createStageNode('s1', 'f1', { name: 'Preliminary', order: 0 });
    const mockOnHighlight = vi.fn();

    render(
      <StagesOverviewPanel nodes={[field, stage]} globalTeams={[]} onHighlightElement={mockOnHighlight} />
    );
    await user.click(screen.getByText('Stages Overview'));
    await user.click(screen.getByTestId('stages-overview-s1'));

    expect(mockOnHighlight).toHaveBeenCalledWith('s1', 'stage');
  });

  it('sorts stages by their order field', async () => {
    const user = userEvent.setup();
    const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
    const stageB = createStageNode('s2', 'f1', { name: 'Second', order: 1 });
    const stageA = createStageNode('s1', 'f1', { name: 'First', order: 0 });

    render(
      // Nodes intentionally out of order -- rendering must sort by stage.data.order.
      <StagesOverviewPanel nodes={[field, stageB, stageA]} globalTeams={[]} onHighlightElement={onHighlightElement} />
    );
    await user.click(screen.getByText('Stages Overview'));

    const rows = screen.getAllByRole('button', { name: /First|Second/ });
    expect(rows[0]).toHaveTextContent('First');
    expect(rows[1]).toHaveTextContent('Second');
  });
});
