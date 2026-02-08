import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamsProLigaCard from '../TeamsProLigaCard'

describe('TeamsProLigaCard', () => {
  const mockData = [
    { liga_name: 'Bundesliga', liga_id: 1, count: 24 },
    { liga_name: 'Regionalliga', liga_id: 2, count: 18 },
  ]

  it('should render card with title', () => {
    render(<TeamsProLigaCard data={mockData} loading={false} />)
    expect(screen.getByText('TEAMS PRO LIGA')).toBeInTheDocument()
  })

  it('should render league names and team counts', () => {
    render(<TeamsProLigaCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<TeamsProLigaCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
