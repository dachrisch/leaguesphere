import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsPerAssociationCard from '../TeamsPerAssociationCard'

describe('TeamsPerAssociationCard', () => {
  const mockData = [
    { association_name: 'Bayern', association_id: 1, count: 24 },
    { association_name: 'NRW', association_id: 2, count: 28 },
  ]

  it('should render card with title', () => {
    render(<TeamsPerAssociationCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PER ASSOCIATION')).toBeInTheDocument()
  })

  it('should render association names and team counts', () => {
    render(<TeamsPerAssociationCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bayern')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('NRW')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsPerAssociationCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
