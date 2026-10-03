import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputDropdown from '../InputDropdown';
import { vi } from 'vitest';

const updateMock = vi.fn();


const setup = (initText = {}) => {
  updateMock.mockClear();
  const initialState = {
    id: 'someInputDropdownId',
    setSelectedIndex: updateMock,
    placeholderText: 'inputDropdownPlaceholderText',
    initValues: initText,
    items: [
      {text: 'first_name first_last_name',
        subtext: 'some team',
        id: 1},
      {text: 'second_name second_last_name',
        subtext: 'some team',
        id: 2},
      {text: 'third_name third_last_name',
        subtext: 'some team',
        id: 3},
    ],
  };
  render(<InputDropdown {...initialState} />);
};

describe('InputDropdown component', () => {
  it('should render component', () => {
    setup();
    const inputElement =
      screen.getByPlaceholderText('inputDropdownPlaceholderText');
    expect(inputElement).toBeInTheDocument();
    expect(inputElement).toBeEnabled();
    expect(screen.getAllByText(/name/i)).toHaveLength(3);
    expect(screen.getByTestId('searchButton')).toBeInTheDocument();
    expect(updateMock.mock.calls).toHaveLength(0);
  });

  it('should write text in input with delete button', () => {
    setup({text: 'some text', id: 1});
    const inputElement =
      screen.getByPlaceholderText('inputDropdownPlaceholderText');
    expect(inputElement).toHaveAttribute('readonly');
    expect(inputElement).toHaveValue('some text');
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(updateMock.mock.calls[0][0]).
        toEqual({text: 'some text', id: 1});
    expect(updateMock.mock.calls).toHaveLength(1);
  });

  it('should write text in input without delete button', () => {
    setup({text: 'different text', id: null});
    const inputElement =
      screen.getByPlaceholderText('inputDropdownPlaceholderText');
    expect(inputElement).not.toHaveAttribute('readonly');
    expect(inputElement).toHaveValue('different text');
    expect(screen.getByTestId('searchButton')).toBeInTheDocument();
    expect(updateMock.mock.calls[0][0]).
        toEqual({text: 'different text', id: null});
    expect(updateMock.mock.calls).toHaveLength(1);
  });
  it('should select item and show delete button', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText(/third_name/i));
    expect(screen.getByDisplayValue('third_name third_last_name'))
        .toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
  it('should call parent method when item selected', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText(/third_name/i));
    expect(updateMock.mock.calls[0][0]).
        toEqual({text: 'third_name third_last_name', id: 3});
    expect(updateMock.mock.calls).toHaveLength(1);
  });
  it('should still list the match when input has a trailing space',
      async () => {
        const user = userEvent.setup();
        setup();
        const input = screen.getByPlaceholderText('inputDropdownPlaceholderText');
        await user.type(input, 'second_name second_last_name  ');
        expect(screen.getByText('second_name second_last_name'))
            .toBeInTheDocument();
        expect(screen.queryByText('first_name first_last_name'))
            .not.toBeInTheDocument();
      });
  it('should not crash on regex special characters in input', async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByPlaceholderText('inputDropdownPlaceholderText');
    await user.type(input, '(+?');
    expect(screen.queryByText(/first_name/)).not.toBeInTheDocument();
  });
  it('should show question badge when nothing is selected', () => {
    setup();
    expect(screen.getByTestId('officialNotFound')).toBeInTheDocument();
    expect(screen.queryByTestId('officialFound')).not.toBeInTheDocument();
  });
  it('should show check badge after selecting an item', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText(/third_name/i));
    expect(screen.getByTestId('officialFound')).toBeInTheDocument();
    expect(screen.queryByTestId('officialNotFound')).not.toBeInTheDocument();
  });
  it('should show check badge for init values with id', () => {
    setup({text: 'some text', id: 1});
    expect(screen.getByTestId('officialFound')).toBeInTheDocument();
  });
  it('should show question badge for init values without id', () => {
    setup({text: 'some text', id: null});
    expect(screen.getByTestId('officialNotFound')).toBeInTheDocument();
  });
  it('should show question badge again after deleting selection',
      async () => {
        const user = userEvent.setup();
        setup({text: 'some text', id: 1});
        await user.click(screen.getByRole('button'));
        expect(screen.getByTestId('officialNotFound')).toBeInTheDocument();
      });
  it('should show question badge again when typing after selection',
      async () => {
        const user = userEvent.setup();
        setup();
        await user.click(screen.getByText(/third_name/i));
        await user.click(screen.getByRole('button'));
        await user.type(
            screen.getByPlaceholderText('inputDropdownPlaceholderText'), 'x');
        expect(screen.getByTestId('officialNotFound')).toBeInTheDocument();
      });
});
