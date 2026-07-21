import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import SaveTemplateSheet from '../SaveTemplateSheet';

describe('SaveTemplateSheet', () => {
  it('requires a name before saving', () => {
    const onSave = vi.fn();
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with name, description and sharing on submit', () => {
    const onSave = vi.fn();
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={onSave} isStaff={true} />);
    fireEvent.change(screen.getByPlaceholderText(/template name/i), { target: { value: 'My Format' } });
    fireEvent.click(screen.getByTestId('sharing-option-association'));
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith({ name: 'My Format', description: '', sharing: 'ASSOCIATION' });
  });

  it('applies the correct CSS classes for backdrop and modal', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} />);
    // React Bootstrap Modal usually puts the modal container in the body
    const modal = document.querySelector('.modal');
    expect(modal).toHaveClass('template-save-modal');

    // Backdrop is also in the body
    const backdrop = document.querySelector('.modal-backdrop');
    expect(backdrop).toHaveClass('template-save-backdrop');
  });

  it('only offers the Personal sharing option for non-staff users', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} isStaff={false} />);
    expect(screen.getByTestId('sharing-option-private')).toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-association')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-global')).not.toBeInTheDocument();
  });

  it('offers all sharing options for staff users', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} isStaff={true} />);
    expect(screen.getByTestId('sharing-option-private')).toBeInTheDocument();
    expect(screen.getByTestId('sharing-option-association')).toBeInTheDocument();
    expect(screen.getByTestId('sharing-option-global')).toBeInTheDocument();
  });

  it('defaults to only Personal when isStaff is not provided', () => {
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTestId('sharing-option-private')).toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-association')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sharing-option-global')).not.toBeInTheDocument();
  });

  it('a non-staff user cannot submit a non-PRIVATE sharing value', () => {
    const onSave = vi.fn();
    render(<SaveTemplateSheet show onHide={vi.fn()} onSave={onSave} isStaff={false} />);
    fireEvent.change(screen.getByPlaceholderText(/template name/i), { target: { value: 'My Format' } });
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));
    expect(onSave).toHaveBeenCalledWith({ name: 'My Format', description: '', sharing: 'PRIVATE' });
  });
});
