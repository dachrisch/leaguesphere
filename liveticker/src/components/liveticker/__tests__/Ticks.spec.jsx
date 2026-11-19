import React from 'react';
import {afterAll, beforeAll, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import Ticks from '../Ticks';
import {LIVETICKER_DATA} from '../../../__tests__/testdata/livetickerData';

beforeAll(() => {
  vi.stubEnv('TZ', 'Europe/Berlin');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const setup = (gameStatus = LIVETICKER_DATA[0].status) => {
  const ticks = LIVETICKER_DATA[0].ticks;
  render(<Ticks entries={ticks} gameStatus={gameStatus}/>);
};

describe('Ticks component', () => {
  it('should render correct', () => {
    setup();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Turnover')).toBeInTheDocument();
    expect(screen.getByText(new RegExp('14:05'))).toBeInTheDocument();
  });

  it('should keep the history and mark the game as finished', () => {
    setup('beendet');
    expect(screen.getByText('Spiel ist bereits beendet.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('Turnover')).toBeInTheDocument();
    expect(screen.getByText('Touchdown: #7 Extra-Punkt: -')).toBeInTheDocument();
  });

  it('does not show the empty hint for a finished game without entries', () => {
    render(<Ticks entries={[]} gameStatus="beendet"/>);
    expect(screen.getByText('Spiel ist bereits beendet.')).toBeInTheDocument();
    expect(screen.queryByText('Keine Einträge bisher vorhanden.')).not.toBeInTheDocument();
  });

  it('shows the empty hint for a live game without entries', () => {
    render(<Ticks entries={[]} gameStatus="1. Halbzeit"/>);
    expect(screen.getByText('Keine Einträge bisher vorhanden.')).toBeInTheDocument();
  });

  it('centers a neutral entry without a team', () => {
    render(
      <Ticks
        entries={[{text: 'Spiel gestartet', team: null, time: '2026-08-15T12:00:00+00:00'}]}
        gameStatus="1. Halbzeit"
      />,
    );
    expect(screen.getByText('Spiel gestartet')).toHaveClass('text-center');
  });
});
