import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ProgressGameDayCard from '../cards/ProgressGameDayCard';
import type { GamedayProgress } from '../../../api/gameProgressApi';
import type { GamedaySummary } from '../../../types/progress';
import uiEN from '../../../i18n/locales/en/ui.json';
import domainEN from '../../../i18n/locales/en/domain.json';

describe('ProgressGameDayCard', () => {
  let testI18n: typeof i18n;

  const renderWithI18n = (component: React.ReactElement) => {
    return render(
      <I18nextProvider i18n={testI18n}>
        {component}
      </I18nextProvider>
    );
  };

  beforeEach(async () => {
    // Create a fresh i18n instance for each test with only English
    testI18n = i18n.createInstance();
    await testI18n
      .use(initReactI18next)
      .init({
        resources: {
          en: {
            ui: uiEN,
            domain: domainEN,
          },
        },
        lng: 'en',
        fallbackLng: 'en',
        defaultNS: 'ui',
        ns: ['ui', 'domain'],
        interpolation: {
          escapeValue: false,
        },
      });
  });

  const mockGameday: GamedayProgress = {
    id: 1,
    name: 'Spieltag 1',
    date: '2026-05-10',
    start: '15:00',
    status: 'live',
    league: 1,
    league_display: 'Liga A',
    season: 1,
    season_display: '2026',
    games: [
      {
        id: 1,
        scheduled: '15:00',
        status: 'Gestartet',
        gameStarted: '15:00',
        gameFinished: null,
        field: 1,
        stage: 'Hauptrunde',
        standing: 'A',
      },
      {
        id: 2,
        scheduled: '15:30',
        status: 'Geplant',
        gameStarted: null,
        gameFinished: null,
        field: 2,
        stage: 'Hauptrunde',
        standing: 'B',
      },
      {
        id: 3,
        scheduled: '16:00',
        status: 'beendet',
        gameStarted: '16:00',
        gameFinished: '17:00',
        field: 3,
        stage: 'Hauptrunde',
        standing: 'C',
      },
    ],
  };

  const mockSummary = {
    status: 'live' as const,
    played: 1,
    live: 1,
    upcoming: 1,
    firstStart: new Date('2026-05-10T15:00:00'),
    lastEnd: new Date('2026-05-10T17:00:00'),
  };

  test('renders gameday name', () => {
    renderWithI18n(<ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />);
    expect(screen.getByText('Spieltag 1')).toBeInTheDocument();
  });

  test('renders gameday date', () => {
    renderWithI18n(<ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />);
    expect(screen.getByText(/10|05/)).toBeInTheDocument();
  });

  test('renders league display in subtitle', () => {
    const { container } = renderWithI18n(
      <ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />
    );
    const subtitle = container.querySelector('div[class*="gameDayCardSubtitle"]');
    expect(subtitle?.textContent).toContain('Liga A');
  });

  test('renders segment bar for each game', () => {
    const { container } = renderWithI18n(
      <ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />
    );
    const segmentBars = container.querySelectorAll('div[class*="segmentBar"]');
    expect(segmentBars.length).toBeGreaterThanOrEqual(3);
  });

  test('renders correct number of games info', () => {
    const { container } = renderWithI18n(
      <ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />
    );
    const stats = container.querySelector('div[class*="gameDayCardStats"]');
    expect(stats?.textContent).toContain('played');
    expect(stats?.textContent).toContain('live');
    expect(stats?.textContent).toContain('upcoming');
  });

  test('handles empty games array', () => {
    const emptyGameday: GamedayProgress = {
      ...mockGameday,
      games: [],
    };

    renderWithI18n(<ProgressGameDayCard gameday={emptyGameday} summary={mockSummary} />);
    expect(screen.getByText('Spieltag 1')).toBeInTheDocument();
  });

  test('renders card container', () => {
    const { container } = renderWithI18n(
      <ProgressGameDayCard gameday={mockGameday} summary={mockSummary} />
    );
    const card = container.querySelector('div');
    expect(card).toBeInTheDocument();
  });
});
