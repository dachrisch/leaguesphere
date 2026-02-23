import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { describe, it, expect } from 'vitest'
import GamedayCalendar from '../GamedayCalendar'
import type { GamedaySchedule } from '../../types/dashboard'

const mockData: GamedaySchedule = {
  gamedays: [
    {
      id: 1,
      name: 'Future Game',
      date: '2026-04-15',
      start: '10:00:00',
      league_name: 'DFFL',
      season_name: '2026',
      status: 'PUBLISHED',
      is_live: false,
    },
    {
      id: 2,
      name: 'Live Game',
      date: '2026-04-01',
      start: '09:00:00',
      league_name: 'DFFL',
      season_name: '2026',
      status: 'IN_PROGRESS',
      is_live: true,
    }
  ],
  live_gameday: { id: 2, name: 'Live Game', date: '2026-04-01' },
  next_gameday: { id: 1, name: 'Future Game', date: '2026-04-15', days_until: 14 }
}

describe('GamedayCalendar', () => {
  const initialMonth = new Date('2026-04-01')

  it('renders loading spinner when loading', () => {
    render(<GamedayCalendar data={null} loading={true} />)
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('shows live gameday warning banner when live', () => {
    render(<GamedayCalendar data={mockData} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText(/Live Game is currently in progress/)).toBeDefined()
  })

  it('shows next gameday info when nothing live', () => {
    const noLive = { ...mockData, live_gameday: null }
    render(<GamedayCalendar data={noLive} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText(/Next gameday: Future Game on 2026-04-15/)).toBeDefined()
  })

  it('shows "No upcoming gamedays scheduled" when empty', () => {
    const empty = { gamedays: [], live_gameday: null, next_gameday: null }
    render(<GamedayCalendar data={empty} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText(/No upcoming gamedays scheduled/)).toBeDefined()
  })

  it('renders weekday headers', () => {
    render(<GamedayCalendar data={mockData} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText('Mo')).toBeDefined()
    expect(screen.getByText('Su')).toBeDefined()
  })

  it('gameday link has correct href', () => {
    render(<GamedayCalendar data={mockData} loading={false} initialMonth={initialMonth} />)
    const link = screen.getByTitle('Future Game')
    expect(link.getAttribute('href')).toBe('/gamedays/gameday/1/')
  })

  it('navigates to previous month', () => {
    render(<GamedayCalendar data={mockData} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText('April 2026')).toBeDefined()
    
    const prevBtn = screen.getByLabelText('Previous month')
    fireEvent.click(prevBtn)
    
    expect(screen.getByText('March 2026')).toBeDefined()
  })

  it('navigates to next month', () => {
    render(<GamedayCalendar data={mockData} loading={false} initialMonth={initialMonth} />)
    expect(screen.getByText('April 2026')).toBeDefined()
    
    const nextBtn = screen.getByLabelText('Next month')
    fireEvent.click(nextBtn)
    
    expect(screen.getByText('May 2026')).toBeDefined()
  })
})
