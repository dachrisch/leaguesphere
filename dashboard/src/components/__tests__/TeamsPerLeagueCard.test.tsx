import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsPerLeagueCard from '../TeamsPerLeagueCard'

describe('TeamsPerLeagueCard', () => {
  const mockData = [
    { league_name: 'Bundesliga', league_id: 1, count: 24 },
    { league_name: 'Regionalliga', league_id: 2, count: 18 },
  ]

  it('should render card with title', () => {
    render(<TeamsPerLeagueCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PER LEAGUE')).toBeInTheDocument()
  })

  it('should render league names and team counts', () => {
    render(<TeamsPerLeagueCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsPerLeagueCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
