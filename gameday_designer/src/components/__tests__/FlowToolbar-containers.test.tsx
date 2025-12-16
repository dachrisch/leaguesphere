/**
 * Tests for FlowToolbar Component - Container Support
 *
 * TDD RED Phase: Tests for adding Field and Stage buttons.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlowToolbar, { type FlowToolbarProps } from '../FlowToolbar';

const defaultProps: FlowToolbarProps = {
  onAddTeam: vi.fn(),
  onAddGame: vi.fn(),
  onAddField: vi.fn(),
  onAddStage: vi.fn(),
  onImport: vi.fn(),
  onExport: vi.fn(),
  onClearAll: vi.fn(),
  hasNodes: false,
  canExport: false,
  canAddStage: false,
};

describe('FlowToolbar - Container Support', () => {
  describe('Add Field button', () => {
    it('renders Add Field button', () => {
      render(<FlowToolbar {...defaultProps} />);

      expect(screen.getByTestId('add-field-button')).toBeInTheDocument();
      expect(screen.getByText('Add Field')).toBeInTheDocument();
    });

    it('calls onAddField when clicked', () => {
      const onAddField = vi.fn();
      render(<FlowToolbar {...defaultProps} onAddField={onAddField} />);

      fireEvent.click(screen.getByTestId('add-field-button'));

      expect(onAddField).toHaveBeenCalledTimes(1);
    });

    it('has appropriate title for accessibility', () => {
      render(<FlowToolbar {...defaultProps} />);

      const button = screen.getByTestId('add-field-button');
      expect(button).toHaveAttribute('title', expect.stringContaining('Field'));
    });
  });

  describe('Add Stage button', () => {
    it('renders Add Stage button', () => {
      render(<FlowToolbar {...defaultProps} />);

      expect(screen.getByTestId('add-stage-button')).toBeInTheDocument();
      expect(screen.getByText('Add Stage')).toBeInTheDocument();
    });

    it('calls onAddStage when clicked', () => {
      const onAddStage = vi.fn();
      render(<FlowToolbar {...defaultProps} canAddStage onAddStage={onAddStage} />);

      fireEvent.click(screen.getByTestId('add-stage-button'));

      expect(onAddStage).toHaveBeenCalledTimes(1);
    });

    it('is disabled when no field is selected (canAddStage=false)', () => {
      render(<FlowToolbar {...defaultProps} canAddStage={false} />);

      const button = screen.getByTestId('add-stage-button');
      expect(button).toBeDisabled();
    });

    it('is enabled when a field is selected (canAddStage=true)', () => {
      render(<FlowToolbar {...defaultProps} canAddStage={true} />);

      const button = screen.getByTestId('add-stage-button');
      expect(button).not.toBeDisabled();
    });

    it('has appropriate title indicating field selection requirement', () => {
      render(<FlowToolbar {...defaultProps} canAddStage={false} />);

      const button = screen.getByTestId('add-stage-button');
      expect(button).toHaveAttribute('title', expect.stringContaining('field'));
    });
  });

  describe('Container button grouping', () => {
    it('groups container buttons together', () => {
      render(<FlowToolbar {...defaultProps} />);

      const fieldButton = screen.getByTestId('add-field-button');
      const stageButton = screen.getByTestId('add-stage-button');

      // Both buttons should be in the same button group
      const fieldParent = fieldButton.parentElement;
      const stageParent = stageButton.parentElement;

      expect(fieldParent).toBe(stageParent);
    });
  });
});
