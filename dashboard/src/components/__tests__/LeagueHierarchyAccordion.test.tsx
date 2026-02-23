import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeagueHierarchyAccordion from '../LeagueHierarchyAccordion'
import { LeagueHierarchy } from '../../types/dashboard'

describe('LeagueHierarchyAccordion', () => {
  const mockData: LeagueHierarchy[] = [
    {
      league_id: 1,
      league_name: 'Bundesliga',
      seasons_count: 1,
      total_gamedays: 1,
      seasons: [
        {
          season_id: 1,
          season_name: '2025/26',
          gamedays_count: 1,
          avg_teams_per_gameday: 4.0,
          avg_games_per_gameday: 2.0,
          gamedays: [
            {
              id: 1,
              name: 'Gameday 1',
              date: '2025-03-01',
              game_count: 2,
            },
          ],
        },
      ],
    },
  ]

  it('should render card with title', () => {
    render(<LeagueHierarchyAccordion data={mockData} loading={false} />)
    expect(screen.getByText('League Hierarchy')).toBeInTheDocument()
  })

  it('should render league name', () => {
    render(<LeagueHierarchyAccordion data={mockData} loading={false} />)
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
  })

  it('should render gameday link with correct href', () => {
    const { container } = render(<LeagueHierarchyAccordion data={mockData} loading={false} />)
    const gamedayLink = container.querySelector('a[href="/gamedays/gameday/1/"]')
    expect(gamedayLink).toBeInTheDocument()
  })

  it('should render game count for gameday', () => {
    render(<LeagueHierarchyAccordion data={mockData} loading={false} />)
    expect(screen.getByText(/2 games/)).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<LeagueHierarchyAccordion data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render empty message when no data', () => {
    render(<LeagueHierarchyAccordion data={[]} loading={false} />)
    expect(screen.getByText('No league hierarchy data available.')).toBeInTheDocument()
  })
})
