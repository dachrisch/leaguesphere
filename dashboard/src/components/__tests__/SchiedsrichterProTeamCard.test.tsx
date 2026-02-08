import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SchiedsrichterProTeamCard from '../SchiedsrichterProTeamCard'

describe('SchiedsrichterProTeamCard', () => {
  const mockData = [
    { team_id: 1, team_name: 'Team A', count: 5 },
    { team_id: 2, team_name: 'Team B', count: 3 },
  ]

  it('should render card with title', () => {
    render(<SchiedsrichterProTeamCard data={mockData} loading={false} />)
    expect(screen.getByText('SCHIEDSRICHTER PRO TEAM')).toBeInTheDocument()
  })

  it('should render team names and referee counts', () => {
    render(<SchiedsrichterProTeamCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<SchiedsrichterProTeamCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
