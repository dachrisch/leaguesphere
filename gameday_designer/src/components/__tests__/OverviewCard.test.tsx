import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OverviewCard from '../OverviewCard';

const renderCard = (props: Partial<React.ComponentProps<typeof OverviewCard>> = {}) =>
  render(
    <OverviewCard testId="test-card" headerTestId="test-card-header" iconClass="bi-trophy" title="Test Card" {...props}>
      <div data-testid="test-card-body">body content</div>
    </OverviewCard>,
  );

describe('OverviewCard', () => {
  it('is collapsed by default -- children are not in the DOM until expanded', () => {
    renderCard();

    expect(screen.getByTestId('test-card')).toBeInTheDocument();
    expect(screen.getByTestId('test-card-header')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('test-card-body')).not.toBeInTheDocument();
  });

  it('expands on header click and collapses again', async () => {
    const user = userEvent.setup();
    renderCard();

    const header = screen.getByTestId('test-card-header');
    await user.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('test-card-body')).toBeInTheDocument();

    await user.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('test-card-body')).not.toBeInTheDocument();
  });

  it('toggles on Enter and Space (keyboard accessible header button)', async () => {
    const user = userEvent.setup();
    renderCard();

    const header = screen.getByTestId('test-card-header');
    expect(header).toHaveAttribute('role', 'button');
    expect(header).toHaveAttribute('tabIndex', '0');

    header.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('test-card-body')).toBeInTheDocument();

    await user.keyboard(' ');
    expect(screen.queryByTestId('test-card-body')).not.toBeInTheDocument();
  });

  it('supports starting expanded via defaultExpanded', () => {
    renderCard({ defaultExpanded: true });

    expect(screen.getByTestId('test-card-header')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('test-card-body')).toBeInTheDocument();
  });

  it('renders title, icon and badge in the header', () => {
    renderCard({ badge: <span data-testid="test-badge">3 stages</span> });

    const header = screen.getByTestId('test-card-header');
    expect(header).toHaveTextContent('Test Card');
    expect(header.querySelector('.bi-trophy')).toBeInTheDocument();
    expect(screen.getByTestId('test-badge')).toBeInTheDocument();
  });

  it('shows the expanded chevron only when open', async () => {
    const user = userEvent.setup();
    renderCard();

    const header = screen.getByTestId('test-card-header');
    expect(header.querySelector('.bi-chevron-right')).toBeInTheDocument();

    await user.click(header);
    expect(header.querySelector('.bi-chevron-down')).toBeInTheDocument();
    expect(header.querySelector('.bi-chevron-right')).not.toBeInTheDocument();
  });

  it('header click also works via fireEvent for non-user-event callers', () => {
    renderCard();

    fireEvent.click(screen.getByTestId('test-card-header'));
    expect(screen.getByTestId('test-card-body')).toBeInTheDocument();
  });
});
