import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../Dashboard'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock functions before mocking the module
const mockGetAdminStats = vi.fn()
const mockGetSpieleProLiga = vi.fn()
const mockGetTeamsProLiga = vi.fn()
const mockGetTeamsProLandesverband = vi.fn()
const mockGetSchiedsrichterProTeam = vi.fn()

// Mock the DashboardApi class
vi.mock('../../utils/api', () => {
  class MockDashboardApi {
    getAdminStats = mockGetAdminStats
    getSpieleProLiga = mockGetSpieleProLiga
    getTeamsProLiga = mockGetTeamsProLiga
    getTeamsProLandesverband = mockGetTeamsProLandesverband
    getSchiedsrichterProTeam = mockGetSchiedsrichterProTeam
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
    mockGetSpieleProLiga.mockResolvedValue([])
    mockGetTeamsProLiga.mockResolvedValue([])
    mockGetTeamsProLandesverband.mockResolvedValue([])
    mockGetSchiedsrichterProTeam.mockResolvedValue([])
  })

  it('renders the dashboard header and calls API on mount', async () => {
    render(<Dashboard />)

    // Check that the header is rendered
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()

    // Verify API methods were called
    await waitFor(() => {
      expect(mockGetAdminStats).toHaveBeenCalled()
      expect(mockGetSpieleProLiga).toHaveBeenCalled()
      expect(mockGetTeamsProLiga).toHaveBeenCalled()
      expect(mockGetTeamsProLandesverband).toHaveBeenCalled()
      expect(mockGetSchiedsrichterProTeam).toHaveBeenCalled()
    })
  })

  it('renders the refresh button and enables it after loading', async () => {
    render(<Dashboard />)

    // While loading, button should show "Aktualisierung..." and be disabled
    expect(screen.getByRole('button', { name: /aktualisierung/i })).toBeDisabled()

    // Wait for API calls to complete
    await waitFor(() => {
      expect(mockGetAdminStats).toHaveBeenCalled()
    })

    // After loading, button should show "Aktualisieren" and be enabled
    const button = screen.getByRole('button', { name: /aktualisieren/i })
    expect(button).not.toBeDisabled()
  })
})
