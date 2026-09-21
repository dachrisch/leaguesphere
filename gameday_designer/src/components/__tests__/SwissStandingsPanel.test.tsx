/**
 * SwissStandingsPanel tests (Task 7, TDD RED phase).
 *
 * Embedded standings panel for the designer: fetches via
 * designerApi.getSwissStandings and renders the standings table with a
 * rounds-completed indicator. Clones the SwissControlModal table/error/
 * loading patterns into designer-embedded markup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SwissStandingsPanel from '../SwissStandingsPanel';
import { designerApi } from '../../api/designerApi';
import type { SwissStandings } from '../../api/designerApi';
import i18n from '../../i18n/testConfig';

const TABLE: SwissStandings = {
  standings: [
    {
      team_id: 11, team_name: 'Alpha', seed: 0, played: 1, wins: 1,
      draws: 0, losses: 0, points_for: 10, points_against: 5, byes: 0, points: 2,
    },
    {
      team_id: 22, team_name: 'Beta', seed: 1, played: 0, wins: 0,
      draws: 0, losses: 0, points_for: 0, points_against: 0, byes: 1, points: 2,
    },
  ],
  rounds_completed: 1,
  rounds_total: 3,
};

describe('SwissStandingsPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
  });

  it('fetches standings for the gameday and renders table rows with bye markers', async () => {
    const spy = vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(spy).toHaveBeenCalledWith(42);
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-standing-11')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('swiss-standing-22')).toHaveTextContent('Bye');
  });

  it('shows a rounds-completed indicator', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(await screen.findByTestId('swiss-rounds-indicator')).toHaveTextContent('1');
    expect(screen.getByTestId('swiss-rounds-indicator')).toHaveTextContent('3');
  });

  it('shows the all-complete state when every round is done', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue({
      ...TABLE,
      rounds_completed: 3,
    });

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(await screen.findByTestId('swiss-all-complete')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching', () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockReturnValue(new Promise(() => {}));

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(screen.getByTestId('swiss-standings-loading')).toBeInTheDocument();
  });

  it('shows backend errors inline', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockRejectedValue({
      response: { data: { error: 'boom' } },
    });

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(await screen.findByTestId('swiss-standings-error')).toHaveTextContent('boom');
  });

  it('refetches standings when refreshKey changes (new round generated)', async () => {
    const round1: SwissStandings = { ...TABLE, rounds_completed: 1 };
    const round2: SwissStandings = { ...TABLE, rounds_completed: 2 };
    const spy = vi
      .spyOn(designerApi, 'getSwissStandings')
      .mockResolvedValueOnce(round1)
      .mockResolvedValueOnce(round2);

    const { rerender } = render(<SwissStandingsPanel gamedayId={42} refreshKey={1} />);
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('swiss-rounds-indicator')).toHaveTextContent('1');

    rerender(<SwissStandingsPanel gamedayId={42} refreshKey={2} />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('swiss-rounds-indicator')).toHaveTextContent('2'),
    );
  });

  it('collapses and expands via the toggle', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);

    await screen.findByTestId('swiss-standings-table');
    const toggle = screen.getByTestId('swiss-standings-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // The animated Collapse keeps exiting children mounted in jsdom, so
    // assert on the toggle state we own rather than DOM absence.
    fireEvent.click(toggle);
    expect(screen.getByTestId('swiss-standings-toggle')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByTestId('swiss-standings-toggle'));
    expect(screen.getByTestId('swiss-standings-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
  });
});
