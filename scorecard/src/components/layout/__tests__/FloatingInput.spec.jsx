import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FloatingInput from '../FloatingInput';

const setup = () => {
  const initialState = {
    id: 'someId',
    text: 'someText',
    value: '',
    onChange: () => {},
  };
  render(<FloatingInput {...initialState} />);
};

describe('FloatingInput component', () => {
  it('should render component', () => {
    setup();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should validate correct', async () => {
    const user = userEvent.setup();
    setup();
    const inputElement = screen.getByPlaceholderText('someText');
    expect(inputElement).toBeInvalid();
    await user.type(inputElement, 'some text');
    expect(inputElement).toBeValid();
  });

  it('should render start adornment when provided', () => {
    render(<FloatingInput id='someId' text='someText' value=''
      onChange={() => {}} startAdornment={<span>adornment</span>} />);
    expect(screen.getByText('adornment')).toBeInTheDocument();
  });

  it('should not render adornment wrapper by default', () => {
    setup();
    expect(screen.queryByTestId('startAdornment')).not.toBeInTheDocument();
  });
});
