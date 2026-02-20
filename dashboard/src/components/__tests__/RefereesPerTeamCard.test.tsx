import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RefereesPerTeamCard from '../RefereesPerTeamCard'

describe('RefereesPerTeamCard', () => {
  const mockData = [
    { team_id: 1, team_name: 'Team A', count: 5 },
    { team_id: 2, team_name: 'Team B', count: 3 },
  ]

  it('should render card with title', () => {
    render(<RefereesPerTeamCard data={mockData} loading={false} />)
    expect(screen.getByText('REFEREES PER TEAM')).toBeInTheDocument()
  })

  it('should render team names and referee counts', () => {
    render(<RefereesPerTeamCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<RefereesPerTeamCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
