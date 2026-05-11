import React from 'react';
import { render } from '@testing-library/react';
import PulseDot from '../cards/PulseDot';

describe('PulseDot', () => {
  test('renders a div element', () => {
    const { container } = render(<PulseDot />);
    const dot = container.querySelector('div');
    expect(dot).toBeInTheDocument();
  });

  test('applies pulseDot className', () => {
    const { container } = render(<PulseDot />);
    const dot = container.querySelector('div');
    expect(dot?.className).toContain('pulseDot');
  });

  test('accepts optional className prop', () => {
    const { container } = render(<PulseDot className="custom-class" />);
    const dot = container.querySelector('div');
    expect(dot?.className).toContain('pulseDot');
    expect(dot?.className).toContain('custom-class');
  });
});
