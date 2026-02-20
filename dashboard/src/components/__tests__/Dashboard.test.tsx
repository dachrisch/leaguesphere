import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../Dashboard'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock functions before mocking the module
const mockGetAdminStats = vi.fn()
const mockGetGamesPerLeague = vi.fn()
const mockGetTeamsPerLeague = vi.fn()
const mockGetTeamsPerAssociation = vi.fn()
const mockGetRefereesPerTeam = vi.fn()
const mockGetLeagueHierarchy = vi.fn()

// Mock the DashboardApi class
vi.mock('../../utils/api', () => {
  class MockDashboardApi {
    getAdminStats = mockGetAdminStats
    getGamesPerLeague = mockGetGamesPerLeague
    getTeamsPerLeague = mockGetTeamsPerLeague
    getTeamsPerAssociation = mockGetTeamsPerAssociation
    getRefereesPerTeam = mockGetRefereesPerTeam
    getLeagueHierarchy = mockGetLeagueHierarchy
  }

  return {
    DashboardApi: MockDashboardApi,
    dashboardApi: {},
  }
})

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup successful API responses by default
    mockGetAdminStats.mockResolvedValue({
      stats: null,
    })
    mockGetGamesPerLeague.mockResolvedValue([])
    mockGetTeamsPerLeague.mockResolvedValue([])
    mockGetTeamsPerAssociation.mockResolvedValue([])
    mockGetRefereesPerTeam.mockResolvedValue([])
    mockGetLeagueHierarchy.mockResolvedValue([])
  })

  it('renders the dashboard header and calls API on mount', async () => {
    render(<Dashboard />)

    // Check that the header is rendered
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()

    // Verify API methods were called
    await waitFor(() => {
      expect(mockGetAdminStats).toHaveBeenCalled()
      expect(mockGetGamesPerLeague).toHaveBeenCalled()
      expect(mockGetTeamsPerLeague).toHaveBeenCalled()
      expect(mockGetTeamsPerAssociation).toHaveBeenCalled()
      expect(mockGetRefereesPerTeam).toHaveBeenCalled()
      expect(mockGetLeagueHierarchy).toHaveBeenCalled()
    })
  })

  it('renders the refresh button and enables it after loading', async () => {
    render(<Dashboard />)

    // While loading, button should show "Refreshing..." and be disabled
    expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled()

    // Wait for API calls to complete
    await waitFor(() => {
      expect(mockGetAdminStats).toHaveBeenCalled()
    })

    // After loading, button should show "Refresh" and be enabled
    const button = screen.getByRole('button', { name: /refresh/i })
    expect(button).not.toBeDisabled()
  })
})
