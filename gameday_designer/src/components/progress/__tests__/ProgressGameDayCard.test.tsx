import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18nConfig from '../../../i18n/testConfig';
import ProgressGameDayCard from '../cards/ProgressGameDayCard';
import type { GamedayProgress } from '../../../api/gameProgressApi';
import type { GamedaySummary } from '../../../types/progress';
import * as useTypedTranslationModule from '../../../i18n/useTypedTranslation';

describe('ProgressGameDayCard', () => {
  const renderWithI18n = (component: React.ReactElement) => {
    return render(
      <I18nextProvider i18n={i18nConfig}>
        {component}
      </I18nextProvider>
    );
  };

  beforeEach(async () => {
    // Ensure i18n is initialized and set to English
    if (!i18nConfig.isInitialized) {
      await i18nConfig.init({});
    }
    await i18nConfig.changeLanguage('en');

    // Mock useTypedTranslation to ensure it returns English translations
    const mockT = (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'ui:progress.card.played': 'played',
        'ui:progress.card.live': 'live',
        'ui:progress.card.upcoming': 'upcoming',
      };
      return translations[key] || defaultValue || key;
    };

    vi.spyOn(useTypedTranslationModule, 'useTypedTranslation').mockReturnValue({
      t: mockT,
      i18n: i18nConfig,
    } as any);
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
