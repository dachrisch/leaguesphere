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
import type { SwissTournamentState } from '../../types/flowchart';
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

  /** The panel starts collapsed (shared OverviewCard): expand to reach body content. */
  const expandPanel = () => {
    fireEvent.click(screen.getByTestId('swiss-standings-header'));
  };

  it('starts collapsed -- body content is not in the DOM until expanded', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);

    expect(screen.getByTestId('swiss-standings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-standings-header')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('swiss-standings-table')).not.toBeInTheDocument();
    // The fetch still runs on mount so the header badge is ready on expand.
    expect(await screen.findByTestId('swiss-rounds-indicator')).toBeInTheDocument();
  });

  it('fetches standings for the gameday and renders table rows with bye markers', async () => {
    const spy = vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);
    expandPanel();

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
    expandPanel();

    expect(await screen.findByTestId('swiss-all-complete')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching', () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockReturnValue(new Promise(() => {}));

    render(<SwissStandingsPanel gamedayId={42} />);
    expandPanel();

    expect(screen.getByTestId('swiss-standings-loading')).toBeInTheDocument();
  });

  it('shows backend errors inline', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockRejectedValue({
      response: { data: { error: 'boom' } },
    });

    render(<SwissStandingsPanel gamedayId={42} />);
    expandPanel();

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
    expandPanel();
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('swiss-rounds-indicator')).toHaveTextContent('1');

    rerender(<SwissStandingsPanel gamedayId={42} refreshKey={2} />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('swiss-rounds-indicator')).toHaveTextContent('2'),
    );
  });

  describe('panel-owned round generation', () => {
    const SWISS: SwissTournamentState = {
      seedOrder: [11, 22, 33, 44],
      rounds: 3,
      fields: 2,
      gameDuration: 30,
      roundStartTimes: { '1': '09:00', '2': '10:00', '3': '11:00' },
      completedRounds: [{ round: 1, gameIds: [101], bye: null }],
      byes: {},
    };

    it('renders a Generate Round N button for the next round and calls onGenerateNext on click', async () => {
      vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);
      const onGenerateNext = vi.fn();

      render(<SwissStandingsPanel gamedayId={42} swiss={SWISS} onGenerateNext={onGenerateNext} />);
      expandPanel();

      const button = await screen.findByTestId('swiss-generate-next');
      expect(button).toHaveTextContent('Generate Round 2');
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onGenerateNext).toHaveBeenCalledTimes(1);
    });

    it('hides the generate button when all rounds are complete', async () => {
      vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue({
        ...TABLE,
        rounds_completed: 3,
      });

      render(
        <SwissStandingsPanel
          gamedayId={42}
          swiss={{ ...SWISS, completedRounds: [1, 2, 3].map((round) => ({ round, gameIds: [], bye: null })) }}
          onGenerateNext={vi.fn()}
        />,
      );
      expandPanel();

      expect(await screen.findByTestId('swiss-all-complete')).toBeInTheDocument();
      expect(screen.queryByTestId('swiss-generate-next')).not.toBeInTheDocument();
    });

    it('disables the button with an inline hint when the prior round is incomplete', async () => {
      vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue({
        ...TABLE,
        rounds_completed: 0,
      });

      render(<SwissStandingsPanel gamedayId={42} swiss={SWISS} onGenerateNext={vi.fn()} />);
      expandPanel();

      const button = await screen.findByTestId('swiss-generate-next');
      expect(button).toBeDisabled();
      expect(screen.getByTestId('swiss-generate-hint')).toBeInTheDocument();
    });

    it('disables the button and shows a generating label while generating', async () => {
      vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

      render(
        <SwissStandingsPanel gamedayId={42} swiss={SWISS} onGenerateNext={vi.fn()} generating />,
      );
      expandPanel();

      const button = await screen.findByTestId('swiss-generate-next');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Generating');
    });

    it('renders no generate button without swiss state (read-only panel)', async () => {
      vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

      render(<SwissStandingsPanel gamedayId={42} />);
      expandPanel();

      expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
      expect(screen.queryByTestId('swiss-generate-next')).not.toBeInTheDocument();
    });
  });

  it('uses the shared overview card chrome and collapses the whole card via header toggle', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);

    const panel = screen.getByTestId('swiss-standings-panel');
    const header = screen.getByTestId('swiss-standings-header');
    // Same Card chrome as Stages Overview / Progression Inspector.
    expect(panel.classList.contains('overview-card')).toBe(true);
    expect(header).toHaveAttribute('role', 'button');
    expect(header).toHaveAttribute('tabIndex', '0');
    expect(header.querySelector('.bi-trophy')).toBeInTheDocument();

    // Starts collapsed: no body in the DOM.
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(panel.querySelector('.card-body')).toBeNull();

    // Expand: the table mounts …
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();

    // … and collapse unmounts the whole body again.
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(panel.querySelector('.card-body')).toBeNull();
    });
  });

  it('has a single collapse toggle: the header itself, no extra toggle button', async () => {
    vi.spyOn(designerApi, 'getSwissStandings').mockResolvedValue(TABLE);

    render(<SwissStandingsPanel gamedayId={42} />);
    expandPanel();

    await screen.findByTestId('swiss-standings-table');
    // The old extra SwissCollapseToggle is gone …
    expect(screen.queryByTestId('swiss-standings-toggle')).not.toBeInTheDocument();
    // … the header itself is the single toggle (no nested buttons) and
    // keyboard accessible via Enter.
    const header = screen.getByTestId('swiss-standings-header');
    expect(header.querySelectorAll('button')).toHaveLength(0);

    fireEvent.keyDown(header, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('swiss-standings-panel').querySelector('.card-body')).toBeNull();
    });
  });
});
