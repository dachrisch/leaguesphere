import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminStatsCard from '../AdminStatsCard'

describe('AdminStatsCard', () => {
  const mockStats = {
    gamedays: 24,
    teams: 156,
    games: 1234,
  }

  it('should render loading spinner when loading', () => {
    render(<AdminStatsCard data={null} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render stats cards when data is loaded', () => {
    render(<AdminStatsCard data={mockStats} loading={false} />)
    
    expect(screen.getByText('Gamedays')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
    
    expect(screen.getByText('Games')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('should render null when data is null and not loading', () => {
    const { container } = render(<AdminStatsCard data={null} loading={false} />)
    expect(container.firstChild).toBeNull()
  })
})
