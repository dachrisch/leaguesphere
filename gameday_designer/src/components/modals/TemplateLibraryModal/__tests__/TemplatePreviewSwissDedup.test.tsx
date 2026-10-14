/**
 * TemplatePreview Swiss Configure (#1970).
 *
 * The generic Configure block (start time, game duration, break, number
 * of fields) stays on page 1 for SWISS exactly like every other template;
 * its values flow into SwissSetupStep (fields + game duration props).
 * SwissSetupStep keeps only the Swiss-specific config: seed order + rounds.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemplatePreview from '../TemplatePreview';
import { TEMPLATE_SWISS, TEMPLATE_F6_2_2 } from '../../../../utils/tournamentTemplates';

const baseProps = {
  currentUserId: 1,
  isStaff: true,
  isLocked: false,
  onApply: vi.fn(),
  onClone: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn(),
};

describe('TemplatePreview Swiss Configure', () => {
  it('shows the Configure inputs for builtin SWISS like any other template', () => {
    render(<TemplatePreview {...baseProps} selected={{ type: 'builtin', template: TEMPLATE_SWISS }} />);

    expect(screen.getByText(TEMPLATE_SWISS.name)).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Start time')).toBeInTheDocument();
    expect(screen.getByText('Game duration (min)')).toBeInTheDocument();
    expect(screen.getByText('Break after (min)')).toBeInTheDocument();
    expect(screen.getByText('Number of fields')).toBeInTheDocument();
    expect(screen.getByTestId('apply-template-button')).toBeInTheDocument();
  });

  it('still shows the Configure inputs for builtin F6-2-2', () => {
    render(<TemplatePreview {...baseProps} selected={{ type: 'builtin', template: TEMPLATE_F6_2_2 }} />);

    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Start time')).toBeInTheDocument();
    expect(screen.getByText('Game duration (min)')).toBeInTheDocument();
    expect(screen.getByText('Break after (min)')).toBeInTheDocument();
    expect(screen.getByText('Number of fields')).toBeInTheDocument();
    expect(screen.getByTestId('apply-template-button')).toBeInTheDocument();
  });
});
