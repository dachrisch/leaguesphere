
import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Timeout, {formatGameTime} from '../Timeout';
import { vi } from 'vitest';

const onSubmitMock = vi.fn();

describe('formatGameTime', () => {
  it('should pad both parts to mm:ss', () => {
    expect(formatGameTime('0', '1')).toBe('00:01');
    expect(formatGameTime('00', '01')).toBe('00:01');
    expect(formatGameTime('12', '34')).toBe('12:34');
  });
  it('should treat a missing part as zero', () => {
    expect(formatGameTime('', '')).toBe('00:00');
    expect(formatGameTime('3', '')).toBe('03:00');
  });
});


const setup = () => {
  onSubmitMock.mockClear();
  render(<Timeout teamName="TeamName" modId="1" onSubmit={onSubmitMock} />);
};

describe('Timeout component', () => {
  it('should render correct', () => {
    setup();
    expect(screen.getByTestId('timeoutButton')).toBeEnabled();
    expect(screen.queryByText('Auszeit TeamName')).toBeInTheDocument();
    expect(screen.queryByText('Fertig')).toBeInTheDocument();
    expect(screen.queryByText('Abbrechen')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
  it('should disable timeout button and set correct time, when clicked on done', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('timeoutButton'));
    await user.type(screen.getByPlaceholderText('Minuten'), '00');
    await user.type(screen.getByPlaceholderText('Sekunden'), '01');
    await user.click(screen.getByRole('button', {name: 'Fertig'}));
    expect(global.bootstrap.Modal.getInstance().hide).toHaveBeenCalled();
    expect(screen.getByTestId('timeoutButton')).toBeDisabled();
    expect(screen.getByText('00:01')).toBeInTheDocument();
    expect(onSubmitMock.mock.calls[0][0]).toEqual({
      team: 'TeamName',
      event: [
        {name: 'Auszeit', input: '00:01'},
      ],
    });
  });
  it('should pad single-digit input to mm:ss', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('timeoutButton'));
    await user.type(screen.getByPlaceholderText('Minuten'), '0');
    await user.type(screen.getByPlaceholderText('Sekunden'), '1');
    await user.click(screen.getByRole('button', {name: 'Fertig'}));
    expect(screen.getByTestId('timeoutButton')).toBeDisabled();
    expect(screen.getByText('00:01')).toBeInTheDocument();
    expect(onSubmitMock.mock.calls[0][0]).toEqual({
      team: 'TeamName',
      event: [
        {name: 'Auszeit', input: '00:01'},
      ],
    });
  });
  it('should do nothing, when clicked on done', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('timeoutButton')).toBeEnabled();
    await user.click(screen.getByTestId('timeoutButton'));
    await user.type(screen.getByPlaceholderText('Minuten'), '00');
    await user.type(screen.getByPlaceholderText('Sekunden'), '01');
    await user.click(screen.getByRole('button', {name: 'Abbrechen'}));
    expect(screen.getByTestId('timeoutButton')).toBeEnabled();
    expect(screen.queryByText('00:01')).not.toBeInTheDocument();
    expect(onSubmitMock.mock.calls).toHaveLength(0);
  });
});
