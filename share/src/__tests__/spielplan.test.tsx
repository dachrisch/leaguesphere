import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseWidgetConfig } from '../lib/params';
import { todayIso } from '../lib/schedule';
import { Spielplan } from '../views/Spielplan';

import { makeGame, makeGameday, makeSnapshot } from './fixtures';

const config = (search: string) => parseWidgetConfig(new URLSearchParams(search));

function futureDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return todayIso(date);
}

const FUTURE = futureDate();

describe('Spielplan', () => {
  it('renders final and upcoming games for the configured team', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        date: '2026-05-01',
        games: [
          makeGame({
            id: 11,
            status: 'beendet',
            results: [
              { id: 1, team_id: 159, team_name: 'Renegades', fh: 2, sh: 1, pa: 0, isHome: true },
              { id: 2, team_id: 200, team_name: 'Sharks', fh: 1, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
      makeGameday({
        id: 2,
        date: FUTURE,
        games: [makeGame({ id: 22, scheduled: '14:00', status: 'Geplant' })],
      }),
    ]);

    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);

    expect(screen.getByText('Renegades')).toBeInTheDocument();
    expect(screen.getByText('3 : 1')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('powered by LeagueSphere')).toBeInTheDocument();
  });

  it('uses LeagueSphere Bootstrap markup (content-section + table)', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [makeGame({ id: 11, status: 'beendet' })],
      }),
    ]);
    const { container } = render(
      <Spielplan snapshot={snapshot} config={config('t=159')} />
    );
    expect(container.querySelector('.content-section')).not.toBeNull();
    expect(container.querySelector('table.table')).not.toBeNull();
  });

  it('shows a LIVE badge for an in-progress game', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        date: FUTURE,
        games: [makeGame({ id: 11, status: 'Gestartet' })],
      }),
    ]);
    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('labels the result columns Ergebnis (past) and Anpfiff (upcoming)', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        id: 1,
        date: '2026-05-01',
        games: [makeGame({ id: 11, status: 'beendet' })],
      }),
      makeGameday({
        id: 2,
        date: FUTURE,
        games: [makeGame({ id: 22, scheduled: '12:20:00', status: 'Geplant' })],
      }),
    ]);
    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);
    expect(screen.getByText('Ergebnis')).toBeInTheDocument();
    expect(screen.getByText('Anpfiff')).toBeInTheDocument();
    expect(screen.getByText('12:20')).toBeInTheDocument();
    expect(screen.queryByText('12:20:00')).not.toBeInTheDocument();
  });

  it('only shows the configured teams', () => {
    const snapshot = makeSnapshot([
      makeGameday({
        games: [
          makeGame({
            id: 1,
            status: 'beendet',
            results: [
              { id: 1, team_id: 500, team_name: 'Alpha', fh: 1, sh: 0, pa: 0, isHome: true },
              { id: 2, team_id: 501, team_name: 'Beta', fh: 0, sh: 0, pa: 0, isHome: false },
            ],
          }),
        ],
      }),
    ]);
    render(<Spielplan snapshot={snapshot} config={config('t=159')} />);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('asks for a team when none is configured', () => {
    render(<Spielplan snapshot={makeSnapshot([])} config={config('')} />);
    expect(screen.getByText('Kein Team konfiguriert.')).toBeInTheDocument();
  });

  it('always shows the LeagueSphere attribution, even with powered=0', () => {
    render(<Spielplan snapshot={makeSnapshot([])} config={config('t=159&powered=0')} />);
    expect(screen.getByText('powered by LeagueSphere')).toBeInTheDocument();
  });

  it('renders a club-provided logo only when one is configured', () => {
    const { container, rerender } = render(
      <Spielplan
        snapshot={makeSnapshot([])}
        config={config('t=159&logo=https%3A%2F%2Fclub.de%2Flogo.png')}
      />
    );
    const img = container.querySelector('img.share-logo');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://club.de/logo.png');

    rerender(<Spielplan snapshot={makeSnapshot([])} config={config('t=159')} />);
    expect(container.querySelector('img.share-logo')).toBeNull();
  });

  it('exposes the accent color as a --share-accent CSS variable on the root', () => {
    const { container } = render(
      <Spielplan snapshot={makeSnapshot([])} config={config('t=159&color=1a73e8')} />
    );
    const root = container.querySelector('.share-widget');
    expect(root?.getAttribute('style')).toContain('--share-accent');
    expect((root as HTMLElement).style.getPropertyValue('--share-accent')).toBe(
      '#1a73e8'
    );
  });
});
