import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SwissRoundAdjustModal from '../SwissRoundAdjustModal';
import { designerApi } from '../../../api/designerApi';
import type {
  SwissRoundPreview,
  SwissGenerateOverrides,
} from '../../../api/designerApi';

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

vi.mock('../../../api/designerApi', () => ({
  designerApi: { generateSwissRound: vi.fn() },
}));

const mockGenerateSwissRound = vi.mocked(designerApi.generateSwissRound);

const PREVIEW: SwissRoundPreview = {
  success: true,
  round: 2,
  pairings: [
    { home_team_id: 1, away_team_id: 2 },
    { home_team_id: 3, away_team_id: 4 },
  ],
  bye_team_id: 5,
  game_ids: [],
};

const TEAMS = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
  { id: 4, name: 'Delta' },
  { id: 5, name: 'Echo' },
];

function renderModal(overrides: Partial<{
  onHide: () => void;
  onConfirm: (o: SwissGenerateOverrides) => Promise<void>;
  preview: SwissRoundPreview;
}> = {}) {
  const onHide = overrides.onHide ?? vi.fn();
  // Same delegation the app uses: Confirm -> generateSwissRound(id, overrides).
  const onConfirm =
    overrides.onConfirm ??
    (async (o: SwissGenerateOverrides) => {
      await mockGenerateSwissRound(7, o);
    });
  render(
    <SwissRoundAdjustModal
      show
      onHide={onHide}
      gamedayId={7}
      roundNumber={2}
      preview={overrides.preview ?? PREVIEW}
      teamOptions={TEAMS}
      fieldCount={2}
      onConfirm={onConfirm}
    />,
  );
  return { onHide, onConfirm };
}

describe('SwissRoundAdjustModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateSwissRound.mockResolvedValue({
      success: true,
      round: 2,
      pairings: [],
      bye_team_id: null,
      game_ids: [101],
    });
  });

  it('renders proposed pairings with per-row home/away, bye, field and time controls', () => {
    renderModal();

    expect(screen.getByTestId('swiss-adjust-modal')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-adjust-home-0')).toHaveValue('1');
    expect(screen.getByTestId('swiss-adjust-away-0')).toHaveValue('2');
    expect(screen.getByTestId('swiss-adjust-home-1')).toHaveValue('3');
    expect(screen.getByTestId('swiss-adjust-away-1')).toHaveValue('4');
    expect(screen.getByTestId('swiss-adjust-bye')).toHaveValue('5');
    expect(screen.getByTestId('swiss-adjust-field-0')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-adjust-time-0')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-adjust-field-1')).toBeInTheDocument();
    expect(screen.getByTestId('swiss-adjust-time-1')).toBeInTheDocument();
  });

  it('swapping teams in a row calls generateSwissRound with swapped ids', async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('swiss-adjust-home-0'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByTestId('swiss-adjust-away-0'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByTestId('swiss-adjust-confirm'));

    await waitFor(() => {
      expect(mockGenerateSwissRound).toHaveBeenCalledWith(7, {
        pairings: [
          { home_team_id: 2, away_team_id: 1 },
          { home_team_id: 3, away_team_id: 4 },
        ],
        bye_team_id: 5,
      });
    });
  });

  it('changing the bye updates bye_team_id in the payload', async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('swiss-adjust-bye'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByTestId('swiss-adjust-confirm'));

    await waitFor(() => {
      expect(mockGenerateSwissRound).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ bye_team_id: 3 }),
      );
    });
  });

  it('editing field and start time includes them in the payload', async () => {
    renderModal();

    fireEvent.change(screen.getByTestId('swiss-adjust-field-0'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByTestId('swiss-adjust-time-0'), {
      target: { value: '10:30' },
    });
    fireEvent.click(screen.getByTestId('swiss-adjust-confirm'));

    await waitFor(() => {
      expect(mockGenerateSwissRound).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          pairings: expect.arrayContaining([
            expect.objectContaining({
              home_team_id: 1,
              away_team_id: 2,
              field: 2,
              start_time: '10:30',
            }),
          ]),
        }),
      );
    });
  });

  it('shows a backend 400 error inline and stays open', async () => {
    const { onHide } = renderModal();
    mockGenerateSwissRound.mockRejectedValue({
      response: { data: { error: 'round 1 is not fully completed' } },
    });

    fireEvent.click(screen.getByTestId('swiss-adjust-confirm'));

    expect(await screen.findByTestId('swiss-adjust-error')).toHaveTextContent(
      'round 1 is not fully completed',
    );
    expect(screen.getByTestId('swiss-adjust-modal')).toBeInTheDocument();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('cancel calls onHide without any API call', () => {
    const { onHide } = renderModal();

    fireEvent.click(screen.getByTestId('swiss-adjust-cancel'));

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(mockGenerateSwissRound).not.toHaveBeenCalled();
  });
});
