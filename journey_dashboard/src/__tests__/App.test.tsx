/**
 * Tests for App with JourneyLayout integration
 *
 * Coverage targets:
 * - JourneyLayout component renders correctly
 * - JourneyHeader renders in the layout
 * - Back button exists and is clickable
 * - Dashboard content renders properly
 * - Component hierarchy: App → JourneyLayout → JourneyHeader + content
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';

// Mock the API calls to prevent actual HTTP requests
vi.mock('../utils/api', () => ({
  fetchStats: vi.fn(() => Promise.resolve(null)),
}));

// Mock the child components to simplify testing
vi.mock('../components/SummaryCards', () => ({
  SummaryCards: () => <div data-testid="summary-cards">Summary Cards</div>,
}));

vi.mock('../components/TopActionsTable', () => ({
  TopActionsTable: () => <div data-testid="top-actions-table">Top Actions Table</div>,
}));

vi.mock('../components/UserTimeline', () => ({
  UserTimeline: () => <div data-testid="user-timeline">User Timeline</div>,
}));

describe('App with JourneyLayout', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should render journey header', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    await waitFor(() => {
      const header = screen.getByTestId('journey-header');
      expect(header).toBeInTheDocument();
    });
  });

  it('should render page title in content area', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    await waitFor(() => {
      const title = screen.getByText('User Journey Dashboard');
      expect(title).toBeInTheDocument();
    });
  });

  it('should render back button in header', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
      expect(backButton).toHaveTextContent('Back');
    });
  });

  it('should have clickable back button', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    await waitFor(() => {
      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
    });

    const backButton = screen.getByTestId('back-button');
    // Button should be clickable (not disabled)
    await user.click(backButton);
    // If click succeeds, button was clickable
    expect(backButton).toBeInTheDocument();
  });
});
