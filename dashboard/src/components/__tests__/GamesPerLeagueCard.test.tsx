import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GamesPerLeagueCard from '../GamesPerLeagueCard'

describe('GamesPerLeagueCard', () => {
  const mockData = [
    { league_name: 'Bundesliga', league_id: 1, count: 287 },
    { league_name: 'Regionalliga', league_id: 2, count: 156 },
  ]

  it('should render card with title', () => {
    render(<GamesPerLeagueCard data={mockData} loading={false} />)
    expect(screen.getByText('GAMES PER LEAGUE')).toBeInTheDocument()
  })

  it('should render league names and counts', () => {
    render(<GamesPerLeagueCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('287')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<GamesPerLeagueCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
