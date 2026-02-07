import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { describe, it, expect, vi } from 'vitest';
import { dashboardApi } from '../../utils/api';

// Mock the API
vi.mock('../../utils/api', () => ({
  dashboardApi: {
    getSummary: vi.fn(),
    getLiveGames: vi.fn(),
  },
}));

describe('Dashboard', () => {
  it('renders loading state initially', () => {
    vi.mocked(dashboardApi.getSummary).mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );
    vi.mocked(dashboardApi.getLiveGames).mockImplementation(() =>
      new Promise(() => {})
    );

    render(<Dashboard />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });
});
