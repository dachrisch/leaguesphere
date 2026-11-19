import React from 'react';
import {afterAll, beforeAll, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {LIVETICKER_DATA} from '../../../__tests__/testdata/livetickerData';
import GameTicker from '../GameTicker';
import userEvent from '@testing-library/user-event';

beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Berlin');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const GAME_TICKER_DATA = LIVETICKER_DATA[0];
const mockFunc = vi.fn();
const setup = (data = GAME_TICKER_DATA) => {
  render(<GameTicker {...data} gameIndex={0} updateGamesToDisplay={mockFunc} />);
};

describe('GameTicker component', () => {
  it('should render correct', () => {
    setup();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(new RegExp(GAME_TICKER_DATA.status))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(GAME_TICKER_DATA.standing))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(GAME_TICKER_DATA.home.name))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(GAME_TICKER_DATA.away.name))).toBeInTheDocument();
    expect(screen.getByTitle('Team hat Ballbesitz')).toBeInTheDocument();
    expect(screen.getByTitle('Klicken, um alle Einträge anzuzeigen'));
  });

  it('shows the kickoff data timestamp in German 24h time', () => {
    setup();
    expect(screen.getByText(/13:30 Uhr/)).toBeInTheDocument();
    expect(screen.getByTitle('Anstoß')).toBeInTheDocument();
  });

  it('hides possession and keeps the history after the final whistle', () => {
    setup({...GAME_TICKER_DATA, status: 'beendet'});
    expect(screen.getByText('Spiel ist bereits beendet.')).toBeInTheDocument();
    expect(screen.getByText('Turnover')).toBeInTheDocument();
    expect(screen.queryByTitle('Team hat Ballbesitz')).not.toBeInTheDocument();
  });

  it('should call updateGamesToDisplay, when clicked on icon', async () => {
    const user = userEvent.setup();
    setup();
    mockFunc.mockClear();
    await user.click(screen.getByTitle('Klicken, um alle Einträge anzuzeigen'));
    expect(mockFunc.mock.calls).toHaveLength(1);
  });
});
