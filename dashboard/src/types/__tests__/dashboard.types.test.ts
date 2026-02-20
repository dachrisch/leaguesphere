import { describe, it, expect } from 'vitest'
import {
  AdminStats,
  GamesPerLeague,
  TeamsPerLeague,
  RefereesPerTeam,
  TeamsPerAssociation,
} from '../dashboard'

describe('Admin Dashboard Types', () => {
  it('should define AdminStats with all required fields', () => {
    const stats: AdminStats = {
      gamedays: 24,
      teams: 156,
      games: 1234,
    }
    expect(stats.gamedays).toBe(24)
    expect(stats.teams).toBe(156)
    expect(stats.games).toBe(1234)
  })

  it('should define GamesPerLeague with league name and count', () => {
    const data: GamesPerLeague = {
      league_name: 'Bundesliga',
      count: 287,
    }
    expect(data.league_name).toBe('Bundesliga')
    expect(data.count).toBe(287)
  })

  it('should define TeamsPerLeague with league name and count', () => {
    const data: TeamsPerLeague = {
      league_name: 'Bundesliga',
      count: 24,
    }
    expect(data.league_name).toBe('Bundesliga')
    expect(data.count).toBe(24)
  })

  it('should define RefereesPerTeam with team and count', () => {
    const data: RefereesPerTeam = {
      team_name: 'Team A',
      team_id: 1,
      count: 5,
    }
    expect(data.team_name).toBe('Team A')
    expect(data.count).toBe(5)
  })

  it('should define TeamsPerAssociation with association and count', () => {
    const data: TeamsPerAssociation = {
      association_name: 'Bayern',
      association_id: 1,
      count: 24,
    }
    expect(data.association_name).toBe('Bayern')
    expect(data.count).toBe(24)
  })
})
