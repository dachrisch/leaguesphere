import React from 'react';
import { render } from '@testing-library/react';
import ProgressSegmentBar from '../cards/ProgressSegmentBar';

describe('ProgressSegmentBar', () => {
  test('renders a div with segmentBar className', () => {
    const { container } = render(<ProgressSegmentBar status="Gestartet" />);
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('segmentBar');
  });

  test('applies segmentBarLive class for Gestartet status', () => {
    const { container } = render(<ProgressSegmentBar status="Gestartet" />);
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('segmentBarLive');
  });

  test('applies segmentBarCompleted class for beendet status', () => {
    const { container } = render(<ProgressSegmentBar status="beendet" />);
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('segmentBarCompleted');
  });

  test('applies segmentBarPlanned class for Geplant status', () => {
    const { container } = render(<ProgressSegmentBar status="Geplant" />);
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('segmentBarPlanned');
  });

  test('applies segmentBarPlanned class for unknown status', () => {
    const { container } = render(<ProgressSegmentBar status="Unknown" />);
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('segmentBarPlanned');
  });

  test('accepts optional className prop', () => {
    const { container } = render(
      <ProgressSegmentBar status="Gestartet" className="custom-class" />
    );
    const bar = container.querySelector('div');
    expect(bar?.className).toContain('custom-class');
  });
});
