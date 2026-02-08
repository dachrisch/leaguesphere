import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsProLandesverbandCard from '../TeamsProLandesverbandCard'

describe('TeamsProLandesverbandCard', () => {
  const mockData = [
    { landesverband_name: 'Bayern', landesverband_id: 1, count: 24 },
    { landesverband_name: 'NRW', landesverband_id: 2, count: 28 },
  ]

  it('should render card with title', () => {
    render(<TeamsProLandesverbandCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PRO LANDESVERBAND')).toBeInTheDocument()
  })

  it('should render association names and team counts', () => {
    render(<TeamsProLandesverbandCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bayern')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('NRW')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsProLandesverbandCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
