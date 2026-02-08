import { render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { describe, it, expect, vi } from 'vitest';
import { dashboardApi } from '../../utils/api';

// Mock the API
vi.mock('../../utils/api', () => ({
  dashboardApi: {
    getPlatformHealth: vi.fn(),
    getRecentActivity: vi.fn(),
    getOnlineUsers: vi.fn(),
    getContentCreation: vi.fn(),
    getFeatureUsage: vi.fn(),
    getUserSegments: vi.fn(),
    getProblemAlerts: vi.fn(),
  },
}));

describe('Dashboard', () => {
  it('renders loading state initially', () => {
    // Mock all API methods to never resolve (showing loading state)
    vi.mocked(dashboardApi.getPlatformHealth).mockImplementation(() =>
      new Promise(() => {}) // Never resolves
    );
    vi.mocked(dashboardApi.getRecentActivity).mockImplementation(() =>
      new Promise(() => {})
    );
    vi.mocked(dashboardApi.getOnlineUsers).mockImplementation(() =>
      new Promise(() => {})
    );
    vi.mocked(dashboardApi.getContentCreation).mockImplementation(() =>
      new Promise(() => {})
    );
    vi.mocked(dashboardApi.getFeatureUsage).mockImplementation(() =>
      new Promise(() => {})
    );
    vi.mocked(dashboardApi.getUserSegments).mockImplementation(() =>
      new Promise(() => {})
    );
    vi.mocked(dashboardApi.getProblemAlerts).mockImplementation(() =>
      new Promise(() => {})
    );

    render(<Dashboard />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });
});
