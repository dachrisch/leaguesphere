
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputWithNumber from '../InputWithNumber';
import { vi } from 'vitest';

const updateFunc = vi.fn();


const setup = (isRequired = false, isOpponentAction = false) => {
  updateFunc.mockClear();
  render(<InputWithNumber update={updateFunc} label="TestLabel"
    isRequired={isRequired} isOpponentAction={isOpponentAction} />);
};

describe('InputWithNumber component', () => {
  it('should render correct', () => {
    setup();
    expect(screen.getByPlaceholderText('TestLabel - Nummer optional')).not.toBeRequired();
  });
  it('input should be required', () => {
    setup(true, true);
    expect(screen.getByPlaceholderText('TestLabel - Trikotnummer')).toBeRequired();
    expect(updateFunc.mock.calls[0][1]).toBeTruthy();
  });
  it('should send correct update', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText('TestLabel - Nummer optional'), '22');
    expect(updateFunc.mock.calls[2][0]).toEqual({
      event: [{ name: 'TestLabel', player: '22' }],
    });
    expect(updateFunc.mock.calls[2][1]).toBeFalsy();
  });
  it('should not allow a decimal jersey number (#1465)', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText('TestLabel - Nummer optional'), '5.5');
    const lastCall = updateFunc.mock.calls[updateFunc.mock.calls.length - 1][0];
    expect(lastCall.event[0].player).toBe('55');
    expect(lastCall.event[0].player).not.toContain('.');
  });
});
