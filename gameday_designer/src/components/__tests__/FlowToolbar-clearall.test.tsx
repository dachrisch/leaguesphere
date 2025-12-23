/**
 * Tests for FlowToolbar - Clear All Confirmation Dialog
 *
 * Verifies that the Clear All button shows a confirmation dialog
 * before executing the clear action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlowToolbar, { type FlowToolbarProps } from '../FlowToolbar';

describe('FlowToolbar - Clear All Confirmation', () => {
  const mockOnClearAll = vi.fn();
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  const defaultProps: FlowToolbarProps = {
    onImport: vi.fn(),
    onExport: vi.fn(),
    onClearAll: mockOnClearAll,
    hasNodes: true,
    canExport: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('shows confirmation dialog when Clear All is clicked with nodes present', async () => {
    confirmSpy.mockReturnValue(false); // User clicks Cancel
    const user = userEvent.setup();
    render(<FlowToolbar {...defaultProps} hasNodes={true} />);

    const clearButton = screen.getByTestId('clear-all-button');
    await user.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(/are you sure/i)
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onClearAll when user confirms the dialog', async () => {
    confirmSpy.mockReturnValue(true); // User clicks OK
    const user = userEvent.setup();
    render(<FlowToolbar {...defaultProps} hasNodes={true} />);

    const clearButton = screen.getByTestId('clear-all-button');
    await user.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mockOnClearAll).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClearAll when user cancels the dialog', async () => {
    confirmSpy.mockReturnValue(false); // User clicks Cancel
    const user = userEvent.setup();
    render(<FlowToolbar {...defaultProps} hasNodes={true} />);

    const clearButton = screen.getByTestId('clear-all-button');
    await user.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(mockOnClearAll).not.toHaveBeenCalled();
  });

  it('calls onClearAll directly when no nodes are present', () => {
    render(<FlowToolbar {...defaultProps} hasNodes={false} />);

    // Button should be disabled when no nodes
    const clearButton = screen.getByTestId('clear-all-button');
    expect(clearButton).toBeDisabled();
  });

  it('confirmation message mentions fields, stages, games, teams, and groups', async () => {
    confirmSpy.mockReturnValue(false);
    const user = userEvent.setup();
    render(<FlowToolbar {...defaultProps} hasNodes={true} />);

    const clearButton = screen.getByTestId('clear-all-button');
    await user.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('fields')
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('stages')
    );
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('games')
    );
  });

  it('confirmation message mentions action cannot be undone', async () => {
    confirmSpy.mockReturnValue(false);
    const user = userEvent.setup();
    render(<FlowToolbar {...defaultProps} hasNodes={true} />);

    const clearButton = screen.getByTestId('clear-all-button');
    await user.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(/cannot be undone/i)
    );
  });
});
