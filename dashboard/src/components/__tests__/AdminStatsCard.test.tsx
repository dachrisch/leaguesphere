import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminStatsCard from '../AdminStatsCard'
import { LeagueHierarchy, TeamEntry } from '../../types/dashboard'

describe('AdminStatsCard', () => {
  const mockStats = {
    gamedays: 24,
    teams: 156,
    games: 1234,
  }

  const mockLeagueHierarchy: LeagueHierarchy[] = [
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
              id: 42,
              name: 'Gameday 1',
              date: '2025-03-01',
              game_count: 3,
            },
          ],
        },
      ],
    },
  ]

  const mockTeamsList: TeamEntry[] = [
    { id: 10, name: 'Team Alpha' },
    { id: 11, name: 'Team Beta' },
  ]

  it('should render loading spinner when loading', () => {
    render(
      <AdminStatsCard
        data={null}
        loading={true}
        leagueHierarchy={[]}
        teamsList={[]}
      />
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render stats cards when data is loaded', () => {
    render(
      <AdminStatsCard
        data={mockStats}
        loading={false}
        leagueHierarchy={mockLeagueHierarchy}
        teamsList={mockTeamsList}
      />
    )

    expect(screen.getByText('Gamedays')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()

    expect(screen.getByText('Teams')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()

    expect(screen.getByText('Games')).toBeInTheDocument()
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('should render null when data is null and not loading', () => {
    const { container } = render(
      <AdminStatsCard
        data={null}
        loading={false}
        leagueHierarchy={[]}
        teamsList={[]}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('should render accordion toggle buttons for each stat card', () => {
    render(
      <AdminStatsCard
        data={mockStats}
        loading={false}
        leagueHierarchy={mockLeagueHierarchy}
        teamsList={mockTeamsList}
      />
    )
    const toggleButtons = screen.getAllByText('Show details')
    expect(toggleButtons).toHaveLength(3)
  })

  it('should render gameday link in gamedays accordion', () => {
    const { container } = render(
      <AdminStatsCard
        data={mockStats}
        loading={false}
        leagueHierarchy={mockLeagueHierarchy}
        teamsList={mockTeamsList}
      />
    )
    const gamedayLinks = container.querySelectorAll('a[href="/gamedays/gameday/42/"]')
    expect(gamedayLinks.length).toBeGreaterThan(0)
  })

  it('should render team link in teams accordion', () => {
    const { container } = render(
      <AdminStatsCard
        data={mockStats}
        loading={false}
        leagueHierarchy={mockLeagueHierarchy}
        teamsList={mockTeamsList}
      />
    )
    const teamLink = container.querySelector('a[href="/teammanager/team/10/"]')
    expect(teamLink).toBeInTheDocument()
    expect(teamLink).toHaveTextContent('Team Alpha')
  })

  it('should render game count entry in games accordion', () => {
    render(
      <AdminStatsCard
        data={mockStats}
        loading={false}
        leagueHierarchy={mockLeagueHierarchy}
        teamsList={mockTeamsList}
      />
    )
    expect(screen.getAllByText(/3 games/).length).toBeGreaterThan(0)
  })
})
