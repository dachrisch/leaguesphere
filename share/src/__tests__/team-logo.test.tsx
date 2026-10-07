import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GameRow } from '../components/GameRow';
import { TeamBlock } from '../components/TeamBlock';
import { WidgetShell } from '../components/WidgetShell';
import { parseWidgetConfig } from '../lib/params';
import type { ScheduleEntry } from '../lib/schedule';

function entry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    gamedayId: 1,
    gamedayName: 'Spieltag',
    date: '2026-05-09',
    time: '14:00',
    league: 'DFFL',
    gameId: 11,
    status: 'beendet',
    isFinal: true,
    isLive: false,
    opponent: 'Erlangen Sharks',
    opponentLogo: 'https://leaguesphere.app/media/teammanager/logos/gone.png',
    isHome: true,
    teamScore: 3,
    opponentScore: 1,
    homeScore: 3,
    awayScore: 1,
    ...overrides,
  };
}

describe('team logos hide on load error', () => {
  it('GameRow removes the img and keeps the name aligned', () => {
    const { container } = render(<GameRow entry={entry()} />);
    const img = container.querySelector('img.share-team-logo');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img.share-team-logo')).toBeNull();
    expect(screen.getByText('Erlangen Sharks')).toBeInTheDocument();
  });

  it('TeamBlock title logo removes itself on error', () => {
    const { container } = render(
      <TeamBlock
        past={[]}
        upcoming={[]}
        teamName="Renegades"
        teamLogo="https://leaguesphere.app/media/teammanager/logos/gone.png"
        showPast={false}
        showFuture={false}
        pastLimit={3}
        futureLimit={0}
        showTitle
        showAllPast={false}
        onShowAllPast={() => {}}
      />
    );
    const img = container.querySelector('h2 img.share-team-logo');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('h2 img.share-team-logo')).toBeNull();
    expect(screen.getByText('Renegades')).toBeInTheDocument();
  });

  it('WidgetShell club logo removes itself on error', () => {
    const config = parseWidgetConfig(
      new URLSearchParams('t=159&logo=https%3A%2F%2Fclub.de%2Flogo.png')
    );
    const { container } = render(
      <WidgetShell config={config}>
        <div>child</div>
      </WidgetShell>
    );
    const img = container.querySelector('img.share-logo');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img.share-logo')).toBeNull();
  });
});
