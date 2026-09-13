import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProgressionInspectorPanel from '../ProgressionInspectorPanel';
import type { FlowNode, HighlightedElement } from '../../types/flowchart';
import { createFieldNode, createStageNode, createGameNodeInStage } from '../../types/flowchart';
import type { ProgressionSimulationResult } from '../../types/progression';
import { createEmptyProgressionSimulationResult } from '../../types/progression';

describe('ProgressionInspectorPanel', () => {
  const field = createFieldNode('f1', { name: 'Field 1', order: 0 });
  const stage = createStageNode('s1', 'f1', { name: 'Preliminary', order: 0 });
  const game = createGameNodeInStage('g1', 's1', { standing: 'Game 1' });
  const nodes: FlowNode[] = [field, stage, game];

  const onHighlightElement = vi.fn() as (id: string, type: HighlightedElement['type']) => void;

  it('shows an empty-state message when there is nothing to simulate', () => {
    render(
      <ProgressionInspectorPanel
        nodes={[]}
        progression={createEmptyProgressionSimulationResult()}
        onHighlightElement={onHighlightElement}
      />
    );
    expect(screen.getByText(/simulated progression here/i)).toBeInTheDocument();
  });

  it('shows an "all clear" badge when there are cells but no findings', () => {
    const progression: ProgressionSimulationResult = {
      cellsByGameId: new Map([
        [
          'g1',
          {
            gameId: 'g1',
            home: { teamLabel: 'Team A', basis: 'actual' },
            away: { teamLabel: 'Team B', basis: 'actual' },
            official: { teamLabel: null, basis: null },
            findings: [],
          },
        ],
      ]),
      findings: [],
    };

    render(<ProgressionInspectorPanel nodes={nodes} progression={progression} onHighlightElement={onHighlightElement} />);

    expect(screen.getByTestId('progression-findings-badge')).toHaveTextContent(/all clear/i);
    expect(screen.getByTestId('progression-outcome-g1')).toHaveTextContent('Team A');
    expect(screen.getByTestId('progression-outcome-g1')).toHaveTextContent('Team B');
  });

  it('shows a findings badge and clicking a finding row highlights the affected node', async () => {
    const progression: ProgressionSimulationResult = {
      cellsByGameId: new Map([
        [
          'g1',
          {
            gameId: 'g1',
            home: { teamLabel: null, basis: null },
            away: { teamLabel: 'Team B', basis: 'actual' },
            official: { teamLabel: null, basis: null },
            findings: [
              {
                id: 'finding-1',
                type: 'dangling_reference',
                message: 'Dangling reference for g1',
                affectedNodes: ['g1'],
              },
            ],
          },
        ],
      ]),
      findings: [
        {
          id: 'finding-1',
          type: 'dangling_reference',
          message: 'Dangling reference for g1',
          affectedNodes: ['g1'],
        },
      ],
    };

    const user = userEvent.setup();
    render(<ProgressionInspectorPanel nodes={nodes} progression={progression} onHighlightElement={onHighlightElement} />);

    expect(screen.getByTestId('progression-findings-badge')).toHaveTextContent('1');

    await user.click(screen.getByTestId('progression-finding-finding-1'));

    expect(onHighlightElement).toHaveBeenCalledWith('g1', 'game');
  });

  it('collapses and expands the body when the header is clicked', async () => {
    const progression: ProgressionSimulationResult = {
      cellsByGameId: new Map([
        [
          'g1',
          {
            gameId: 'g1',
            home: { teamLabel: 'Team A', basis: 'actual' },
            away: { teamLabel: 'Team B', basis: 'actual' },
            official: { teamLabel: null, basis: null },
            findings: [],
          },
        ],
      ]),
      findings: [],
    };

    const user = userEvent.setup();
    render(<ProgressionInspectorPanel nodes={nodes} progression={progression} onHighlightElement={onHighlightElement} />);

    const collapseWrapper = screen.getByTestId('progression-outcome-g1').closest('.collapse');
    expect(collapseWrapper).toHaveClass('show');

    await user.click(screen.getByText('Progression Inspector'));

    expect(collapseWrapper).not.toHaveClass('show');
  });
});
