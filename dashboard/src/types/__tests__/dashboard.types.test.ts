import { describe, it, expect } from 'vitest'
import {
  AdminStats,
  SpieleProLiga,
  TeamsProLiga,
  SchiedsrichterProTeam,
  TeamsProLandesverband,
} from '../dashboard'

describe('Admin Dashboard Types', () => {
  it('should define AdminStats with all required fields', () => {
    const stats: AdminStats = {
      spieltage: 24,
      teams: 156,
      spiele: 1234,
    }
    expect(stats.spieltage).toBe(24)
    expect(stats.teams).toBe(156)
    expect(stats.spiele).toBe(1234)
  })

  it('should define SpieleProLiga with league name and count', () => {
    const data: SpieleProLiga = {
      liga_name: 'Bundesliga',
      count: 287,
    }
    expect(data.liga_name).toBe('Bundesliga')
    expect(data.count).toBe(287)
  })

  it('should define TeamsProLiga with league name and count', () => {
    const data: TeamsProLiga = {
      liga_name: 'Bundesliga',
      count: 24,
    }
    expect(data.liga_name).toBe('Bundesliga')
    expect(data.count).toBe(24)
  })

  it('should define SchiedsrichterProTeam with team and count', () => {
    const data: SchiedsrichterProTeam = {
      team_name: 'Team A',
      team_id: 1,
      count: 5,
    }
    expect(data.team_name).toBe('Team A')
    expect(data.count).toBe(5)
  })

  it('should define TeamsProLandesverband with association and count', () => {
    const data: TeamsProLandesverband = {
      landesverband_name: 'Bayern',
      landesverband_id: 1,
      count: 24,
    }
    expect(data.landesverband_name).toBe('Bayern')
    expect(data.count).toBe(24)
  })
})
