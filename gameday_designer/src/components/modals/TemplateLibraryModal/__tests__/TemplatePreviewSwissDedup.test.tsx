/**
 * TemplatePreview Swiss dedup (#1970).
 *
 * For builtin SWISS the generic Configure block (start time, game
 * duration, break, number of fields) duplicates SwissSetupStep's
 * Tournament setup — and its values are ignored for Swiss
 * (handleTeamConfirm routes SWISS to swiss-setup discarding applyConfig).
 * SwissSetupStep stays the single source of truth: the Configure inputs
 * are hidden for SWISS (title/description/Apply stay), other builtins
 * like F6-2-2 keep them.
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

describe('TemplatePreview Swiss Configure dedup', () => {
  it('shows no Configure inputs for builtin SWISS but keeps title and Apply', () => {
    render(<TemplatePreview {...baseProps} selected={{ type: 'builtin', template: TEMPLATE_SWISS }} />);

    expect(screen.getByText(TEMPLATE_SWISS.name)).toBeInTheDocument();
    expect(screen.queryByText('Configure')).not.toBeInTheDocument();
    expect(screen.queryByText('Start time')).not.toBeInTheDocument();
    expect(screen.queryByText('Game duration (min)')).not.toBeInTheDocument();
    expect(screen.queryByText('Break after (min)')).not.toBeInTheDocument();
    expect(screen.queryByText('Number of fields')).not.toBeInTheDocument();
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
