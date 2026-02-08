import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SpieleProLigaCard from '../SpieleProLigaCard'

describe('SpieleProLigaCard', () => {
  const mockData = [
    { liga_name: 'Bundesliga', liga_id: 1, count: 287 },
    { liga_name: 'Regionalliga', liga_id: 2, count: 156 },
  ]

  it('should render card with title', () => {
    render(<SpieleProLigaCard data={mockData} loading={false} />)
    expect(screen.getByText('SPIELENDE PRO LIGA')).toBeInTheDocument()
  })

  it('should render league names and counts', () => {
    render(<SpieleProLigaCard data={mockData} loading={false} />)
    
    expect(screen.getByText('Bundesliga')).toBeInTheDocument()
    expect(screen.getByText('287')).toBeInTheDocument()
    
    expect(screen.getByText('Regionalliga')).toBeInTheDocument()
    expect(screen.getByText('156')).toBeInTheDocument()
  })

  it('should render loading spinner when loading', () => {
    render(<SpieleProLigaCard data={[]} loading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
