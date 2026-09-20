import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SwissControlModal from '../SwissControlModal';
import type { SwissStandings } from '../../../api/designerApi';

const mockI18n = vi.hoisted(() => ({
  // Stable t across renders, like the real i18next hook: components
  // legitimately depend on t in effect deps, and a fresh identity per
  // render would retrigger those effects in an endless loop.
  t: (key: string, params?: Record<string, number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('../../../i18n/useTypedTranslation', () => ({
  useTypedTranslation: () => ({ t: mockI18n.t }),
}));

const mockSwissApi = vi.hoisted(() => ({
  getSwissStandings: vi.fn(),
  generateSwissRound: vi.fn(),
}));

vi.mock('../../../api/designerApi', () => ({
  designerApi: mockSwissApi,
}));

const mockGetSwissStandings = mockSwissApi.getSwissStandings;
const mockGenerateSwissRound = mockSwissApi.generateSwissRound;

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

describe('SwissControlModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSwissStandings.mockResolvedValue(TABLE);
  });

  it('loads and renders the standings table with bye markers', async () => {
    render(<SwissControlModal show onHide={vi.fn()} gamedayId={42} />);

    expect(mockGetSwissStandings).toHaveBeenCalledWith(42);
    expect(await screen.findByTestId('swiss-standings-table')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-standing-11')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('swiss-standing-22')).toHaveTextContent('modal:swissControl.byeLabel');
  });

  it('generates the next round and reloads standings', async () => {
    mockGenerateSwissRound.mockResolvedValue({
      success: true, round: 2, pairings: [], bye_team_id: null, game_ids: [201],
    });
    render(<SwissControlModal show onHide={vi.fn()} gamedayId={42} />);

    fireEvent.click(await screen.findByTestId('swiss-generate-next'));

    await waitFor(() => {
      expect(mockGenerateSwissRound).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(mockGetSwissStandings).toHaveBeenCalledTimes(2);
    });
  });

  it('shows backend gate errors without closing', async () => {
    mockGenerateSwissRound.mockRejectedValue({
      response: { data: { error: 'round 1 is not fully completed' } },
    });
    render(<SwissControlModal show onHide={vi.fn()} gamedayId={42} />);

    fireEvent.click(await screen.findByTestId('swiss-generate-next'));

    expect(await screen.findByTestId('swiss-control-error')).toHaveTextContent(
      'round 1 is not fully completed',
    );
  });

  it('hides the generate button when all rounds are complete', async () => {
    mockGetSwissStandings.mockResolvedValue({
      ...TABLE,
      rounds_completed: 3,
    });
    render(<SwissControlModal show onHide={vi.fn()} gamedayId={42} />);

    expect(await screen.findByTestId('swiss-all-complete')).toBeInTheDocument();
    expect(screen.queryByTestId('swiss-generate-next')).not.toBeInTheDocument();
  });

  it('does not fetch while hidden', () => {
    render(<SwissControlModal show={false} onHide={vi.fn()} gamedayId={42} />);

    expect(mockGetSwissStandings).not.toHaveBeenCalled();
  });
});
