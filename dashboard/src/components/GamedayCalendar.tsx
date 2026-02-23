import React, { useMemo, useState } from 'react'
import { Card, Alert, Spinner, Row, Col } from 'react-bootstrap'
import type { GamedaySchedule, GamedayCalendarEntry } from '../types/dashboard'

interface Props {
  data: GamedaySchedule | null
  loading: boolean
  initialMonth?: Date
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  // Monday = 0, Sunday = 6 (ISO weekday - 1)
  const startDow = (firstDay.getDay() + 6) % 7 // 0=Mon … 6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid: (Date | null)[] = []

  for (let i = 0; i < startDow; i++) {
    grid.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(new Date(year, month, d))
  }
  while (grid.length < 42) {
    grid.push(null)
  }
  return grid
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getGamedayVariant(
  entry: GamedayCalendarEntry,
  todayStr: string
): 'danger' | 'info' | 'primary' | 'secondary' {
  if (entry.is_live) return 'danger'
  if (entry.date === todayStr) return 'info'
  if (entry.date > todayStr) return 'primary'
  return 'secondary'
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const GamedayCalendar: React.FC<Props> = ({ data, loading, initialMonth }) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const base = initialMonth ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const todayStr = useMemo(() => toISODate(new Date()), [])

  const gamedayMap = useMemo<Map<string, GamedayCalendarEntry>>(() => {
    const map = new Map<string, GamedayCalendarEntry>()
    if (!data) return map
    for (const entry of data.gamedays) {
      map.set(entry.date, entry)
    }
    return map
  }, [data])

  const grid = useMemo(
    () => buildCalendarGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth]
  )

  const statusBanner = useMemo<{ variant: string; text: string } | null>(() => {
    if (!data) return null
    if (data.live_gameday) {
      return {
        variant: 'danger',
        text: `⚠️ ${data.live_gameday.name} is currently in progress (${data.live_gameday.date})`,
      }
    }
    if (data.next_gameday) {
      const { name, date, days_until } = data.next_gameday
      const label =
        days_until === 0
          ? 'today'
          : days_until === 1
            ? 'tomorrow'
            : `in ${days_until} days`
      return {
        variant: 'info',
        text: `Next gameday: ${name} on ${date} (${label})`,
      }
    }
    return null
  }, [data])

  const prevMonth = () => {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  }

  if (loading) {
    return (
      <Card>
        <Card.Body className="text-center py-4">
          <Spinner animation="border" role="status" />
        </Card.Body>
      </Card>
    )
  }

  return (
    <Card>
      <Card.Header>
        <h5 className="mb-0">Gameday Calendar</h5>
        {statusBanner && (
          <Alert variant={statusBanner.variant} className="mb-0 mt-2 py-2">
            {statusBanner.text}
          </Alert>
        )}
        {!statusBanner && data && data.gamedays.length === 0 && (
          <Alert variant="secondary" className="mb-0 mt-2 py-2">
            No upcoming gamedays scheduled
          </Alert>
        )}
        {!statusBanner && data && data.gamedays.length > 0 && !data.next_gameday && !data.live_gameday && (
          <Alert variant="secondary" className="mb-0 mt-2 py-2">
            No upcoming gamedays scheduled
          </Alert>
        )}
      </Card.Header>
      <Card.Body>
        {/* Month navigation */}
        <Row className="align-items-center mb-2">
          <Col xs="auto">
            <button className="btn btn-outline-secondary btn-sm" onClick={prevMonth} aria-label="Previous month">
              &lt;
            </button>
          </Col>
          <Col className="text-center fw-bold">
            {formatMonthLabel(currentMonth)}
          </Col>
          <Col xs="auto">
            <button className="btn btn-outline-secondary btn-sm" onClick={nextMonth} aria-label="Next month">
              &gt;
            </button>
          </Col>
        </Row>

        {/* Weekday headers */}
        <Row className="text-center mb-1">
          {WEEKDAYS.map(day => (
            <Col key={day} className="px-1 fw-semibold small">
              {day}
            </Col>
          ))}
        </Row>

        {/* Calendar grid */}
        {Array.from({ length: 6 }, (_, week) => (
          <Row key={week} className="text-center mb-1">
            {grid.slice(week * 7, week * 7 + 7).map((cell, idx) => (
              <Col key={idx} className="px-1">
                {cell === null ? (
                  <span className="d-block" style={{ minHeight: '2rem' }} />
                ) : (() => {
                  const iso = toISODate(cell)
                  const entry = gamedayMap.get(iso)
                  if (entry) {
                    const variant = getGamedayVariant(entry, todayStr)
                    return (
                      <a
                        href={`/gamedays/gameday/${entry.id}/`}
                        className={`btn btn-${variant} btn-sm w-100`}
                        title={entry.name}
                        style={{ fontSize: '0.75rem', padding: '2px 4px' }}
                      >
                        {cell.getDate()}
                      </a>
                    )
                  }
                  return (
                    <span
                      className="d-block text-muted"
                      style={{ minHeight: '2rem', lineHeight: '2rem', fontSize: '0.8rem' }}
                    >
                      {cell.getDate()}
                    </span>
                  )
                })()}
              </Col>
            ))}
          </Row>
        ))}
      </Card.Body>
    </Card>
  )
}

export default GamedayCalendar
