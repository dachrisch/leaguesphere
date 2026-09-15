/**
 * Comprehensive Tests for FlowToolbar Component
 *
 * Tests cover:
 * - Import/Export functionality
 * - File handling and JSON parsing
 * - Undo/Redo controls
 * - Error handling
 * - Button states and interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlowToolbar, { type FlowToolbarProps } from '../FlowToolbar';

const defaultProps: FlowToolbarProps = {
  onImport: vi.fn(),
  onExport: vi.fn(),
  gamedayStatus: 'DRAFT',
  canExport: false,
};

describe('FlowToolbar', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Rendering', () => {
    it('renders the toolbar container', () => {
      render(<FlowToolbar {...defaultProps} />);
      expect(screen.getByTestId('flow-toolbar')).toBeInTheDocument();
    });

    it('renders Import button', () => {
      render(<FlowToolbar {...defaultProps} />);
      expect(screen.getByTestId('import-button')).toBeInTheDocument();
      expect(screen.queryByText('Import')).not.toBeInTheDocument();
    });

    it('renders Export button', () => {
      render(<FlowToolbar {...defaultProps} />);
      expect(screen.getByTestId('export-button')).toBeInTheDocument();
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });

    it('does NOT render Actions dropdown (moved to metadata section)', () => {
      render(<FlowToolbar {...defaultProps} />);
      expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    });

    it('renders hidden file input', () => {
      render(<FlowToolbar {...defaultProps} />);
      const fileInput = screen.getByTestId('import-file-input');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', '.json,application/json');
      expect(fileInput).toHaveStyle({ display: 'none' });
    });
  });

  describe('Undo/Redo buttons', () => {
    it('renders both undo and redo buttons when both callbacks are provided', () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      render(<FlowToolbar {...defaultProps} onUndo={onUndo} onRedo={onRedo} />);
      expect(screen.getByTestId('undo-button')).toBeInTheDocument();
      expect(screen.getByTestId('redo-button')).toBeInTheDocument();
    });

    it('calls onUndo when undo button is clicked', async () => {
      const onUndo = vi.fn();
      const user = userEvent.setup();
      render(<FlowToolbar {...defaultProps} onUndo={onUndo} canUndo={true} />);

      await user.click(screen.getByTestId('undo-button'));
      expect(onUndo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Export functionality', () => {
    it('enables Export button when canExport is true', () => {
      render(<FlowToolbar {...defaultProps} canExport={true} />);
      expect(screen.getByTestId('export-button')).not.toBeDisabled();
    });

    it('calls onExport when Export button is clicked', async () => {
      const onExport = vi.fn();
      const user = userEvent.setup();
      render(<FlowToolbar {...defaultProps} onExport={onExport} canExport={true} />);

      await user.click(screen.getByTestId('export-button'));
      expect(onExport).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button tooltips and accessibility', () => {
    it('has tooltip for Import button', () => {
      render(<FlowToolbar {...defaultProps} />);
      const importButton = screen.getByTestId('import-button');
      expect(importButton).toHaveAttribute('title', 'Import a tournament schedule from a JSON file');
    });

    it('has tooltip for Export button', () => {
      render(<FlowToolbar {...defaultProps} />);
      const exportButton = screen.getByTestId('export-button');
      expect(exportButton).toHaveAttribute('title', 'Export the current tournament schedule to a JSON file');
    });

    it('has tooltip for Undo button when rendered', () => {
      const onUndo = vi.fn();
      render(<FlowToolbar {...defaultProps} onUndo={onUndo} />);
      const undoButton = screen.getByTestId('undo-button');
      expect(undoButton).toHaveAttribute('title', 'Undo the last action');
    });

    it('has tooltip for Redo button when rendered', () => {
      const onRedo = vi.fn();
      render(<FlowToolbar {...defaultProps} onRedo={onRedo} />);
      const redoButton = screen.getByTestId('redo-button');
      expect(redoButton).toHaveAttribute('title', 'Redo the previously undone action');
    });
  });

  describe('Expert Mode toggle', () => {
    it('does not render the toggle when onToggleExpertMode is not provided', () => {
      render(<FlowToolbar {...defaultProps} />);
      expect(screen.queryByTestId('expert-mode-toggle')).not.toBeInTheDocument();
    });

    it('renders unchecked by default when off', () => {
      render(<FlowToolbar {...defaultProps} onToggleExpertMode={vi.fn()} />);
      expect(screen.getByTestId('expert-mode-toggle')).not.toBeChecked();
    });

    it('renders checked when expertMode is true', () => {
      render(<FlowToolbar {...defaultProps} expertMode onToggleExpertMode={vi.fn()} />);
      expect(screen.getByTestId('expert-mode-toggle')).toBeChecked();
    });

    it('calls onToggleExpertMode with the new value when clicked', async () => {
      const onToggleExpertMode = vi.fn();
      const user = userEvent.setup();
      render(<FlowToolbar {...defaultProps} onToggleExpertMode={onToggleExpertMode} />);

      await user.click(screen.getByTestId('expert-mode-toggle'));

      expect(onToggleExpertMode).toHaveBeenCalledWith(true);
    });

    it('associates the visible "Expert Mode" label with the switch programmatically', () => {
      render(<FlowToolbar {...defaultProps} onToggleExpertMode={vi.fn()} />);

      // getByLabelText only succeeds via a real <label for>/aria-labelledby
      // association — not just visually-adjacent text — so this is the
      // actual accessible-name check a screen reader would rely on.
      const toggle = screen.getByLabelText('Expert Mode');
      expect(toggle).toBe(screen.getByTestId('expert-mode-toggle'));
    });

    it('describes the switch for assistive tech via aria-describedby, not just a title on the label', () => {
      render(<FlowToolbar {...defaultProps} onToggleExpertMode={vi.fn()} />);

      const toggle = screen.getByTestId('expert-mode-toggle');
      const describedById = toggle.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      expect(document.getElementById(describedById!)).toHaveTextContent(
        'Toggle Expert Mode: inspect the simulated progression and see correctness findings (never blocks saving)'
      );
    });
  });
});