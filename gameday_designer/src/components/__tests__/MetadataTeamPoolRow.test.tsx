/**
 * Top-row card consistency tests.
 *
 * The metadata (masterdata), Team Pool, and Swiss control cards must share
 * one chrome + collapse pattern: the metadata Accordion (Accordion.Item with
 * a status-tinted accordion-button header, whole-card collapse via
 * activeKey). No Card frames, no per-card shadow/border language.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MetadataTeamPoolRow from '../MetadataTeamPoolRow';
import SwissStandingsPanel from '../SwissStandingsPanel';
import { gamedayApi } from '../../api/gamedayApi';
import { designerApi } from '../../api/designerApi';
import i18n from '../../i18n/testConfig';
import type {
  GamedayMetadata,
  FlowValidationResult,
} from '../../types/flowchart';

vi.mock('../../api/gamedayApi');
vi.mock('../../api/designerApi');

const METADATA: GamedayMetadata = {
  id: 1,
  name: 'Test Gameday',
  date: '2026-05-01',
  start: '10:00',
  format: 'tournament',
  author: 1,
  address: 'Test Venue',
  season: 1,
  league: 1,
  status: 'DRAFT',
} as GamedayMetadata;

const VALIDATION: FlowValidationResult = { isValid: true, errors: [], warnings: [] };

function createRowProps(overrides: Partial<React.ComponentProps<typeof MetadataTeamPoolRow>> = {}) {
  return {
    metadata: METADATA,
    onUpdateMetadata: vi.fn(),
    onClearAll: vi.fn(),
    onDeleteGameday: vi.fn(),
    onPublishGameday: vi.fn(),
    onUnlockGameday: vi.fn(() => Promise.resolve()),
    validation: VALIDATION,
    onHighlightElement: vi.fn(),
    highlightedElement: null,
    readOnly: false,
    hasData: false,
    isCollapsed: false,
    globalTeams: [],
    globalTeamGroups: [],
    allNodes: [],
    onAddGlobalTeam: vi.fn(),
    onUpdateGlobalTeam: vi.fn(),
    onDeleteGlobalTeam: vi.fn(),
    onReorderGlobalTeam: vi.fn(),
    onAddGlobalTeamGroup: vi.fn(),
    onUpdateGlobalTeamGroup: vi.fn(),
    onDeleteGlobalTeamGroup: vi.fn(),
    onReorderGlobalTeamGroup: vi.fn(),
    onShowTeamSelection: vi.fn(),
    getTeamUsage: vi.fn(() => [] as { gameId: string; slot: 'home' | 'away' }[]),
    ...overrides,
  };
}

describe('MetadataTeamPoolRow top-row card consistency', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
    vi.mocked(gamedayApi.listSeasons).mockResolvedValue([]);
    vi.mocked(gamedayApi.listLeagues).mockResolvedValue([]);
    vi.mocked(gamedayApi.getGameday).mockResolvedValue({ ...METADATA, resource_urls: [] } as never);
    vi.mocked(designerApi.getSwissStandings).mockResolvedValue({
      standings: [],
      rounds_completed: 0,
      rounds_total: 3,
    });
  });

  it('team pool card uses the metadata accordion chrome (no Card frame)', () => {
    const { container } = render(<MetadataTeamPoolRow {...createRowProps()} />);

    const poolCard = screen.getByTestId('team-pool-card');
    // Same structural Accordion chrome as the metadata card …
    expect(poolCard.querySelector('.accordion-item')).toBeInTheDocument();
    expect(poolCard.querySelector('.accordion-header')).toBeInTheDocument();
    expect(poolCard.querySelector('.accordion-button')).toBeInTheDocument();
    // … and a plain header: the yellow status tint is reserved for the
    // metadata (masterdata) card only (DRAFT would be header-status-warning).
    const poolHeaderClass = poolCard.querySelector('.accordion-header')?.className ?? '';
    expect(poolHeaderClass).not.toMatch(/header-status-/);
    // No Bootstrap Card frame left on the pool card.
    expect(poolCard.classList.contains('card')).toBe(false);
    expect(container.querySelector('.metadata-team-pool-row')?.querySelector('.card')).toBeNull();
  });

  it('team pool collapses the whole card via its header toggle, independently of metadata', async () => {
    render(<MetadataTeamPoolRow {...createRowProps()} />);

    const poolToggle = screen
      .getByTestId('team-pool-card')
      .querySelector('.accordion-button') as HTMLElement | null;
    expect(poolToggle).toBeInTheDocument();
    expect(poolToggle).not.toHaveClass('collapsed');

    fireEvent.click(poolToggle as HTMLElement);
    expect(poolToggle).toHaveClass('collapsed');
    // Whole-card collapse: the pool body unmounts (after the exit transition) …
    await waitFor(() => {
      expect(screen.getByTestId('team-pool-card').querySelector('.accordion-body')).toBeNull();
    });
    // … while the metadata card stays open (independent collapse state).
    expect(screen.getByTestId('gameday-metadata-toggle')).not.toHaveClass('collapsed');
  });

  it('team pool follows scroll collapse like metadata (forceCollapsed, no auto-reopen)', () => {
    const props = createRowProps({ isCollapsed: false });
    const { rerender } = render(<MetadataTeamPoolRow {...props} />);
    expect(
      screen.getByTestId('team-pool-card').querySelector('.accordion-button'),
    ).not.toHaveClass('collapsed');

    rerender(<MetadataTeamPoolRow {...props} isCollapsed />);
    expect(
      screen.getByTestId('team-pool-card').querySelector('.accordion-button'),
    ).toHaveClass('collapsed');
    expect(screen.getByTestId('gameday-metadata-toggle')).toHaveClass('collapsed');
  });

  it('swiss control card shares the accordion chrome with a plain (untinted) header', async () => {
    const { container } = render(
      <MetadataTeamPoolRow
        {...createRowProps()}
        swissPanel={<SwissStandingsPanel gamedayId={1} />}
      />,
    );

    const swissCard = await screen.findByTestId('swiss-standings-panel');
    expect(swissCard.querySelector('.accordion-item')).toBeInTheDocument();
    expect(swissCard.querySelector('.accordion-header')).toBeInTheDocument();
    expect(swissCard.querySelector('.accordion-button')).toBeInTheDocument();
    // Plain header: the yellow status tint is reserved for metadata only.
    const swissHeaderClass = swissCard.querySelector('.accordion-header')?.className ?? '';
    expect(swissHeaderClass).not.toMatch(/header-status-/);
    const poolHeaderClass =
      screen.getByTestId('team-pool-card').querySelector('.accordion-header')?.className ?? '';
    expect(poolHeaderClass).not.toMatch(/header-status-/);

    // Metadata keeps its status tint while pool + swiss stay plain.
    expect(screen.getByTestId('gameday-metadata-header')).toHaveClass('header-status-warning');

    // Identical structural chrome across all three top-row cards, but
    // pool + swiss headers stay plain while metadata alone carries the tint.
    const headers = Array.from(
      container.querySelectorAll('.metadata-team-pool-row__metadata .accordion-header'),
    );
    expect(headers).toHaveLength(1);
    const headerClasses = (el: Element) =>
      Array.from(el.classList)
        .filter((c) => c === 'accordion-header' || c.startsWith('header-status-'))
        .sort();
    expect(headerClasses(screen.getByTestId('gameday-metadata-header'))).toEqual(
      ['accordion-header', 'header-status-warning'].sort(),
    );
    expect(headerClasses(screen.getByTestId('team-pool-card').querySelector('.accordion-header')!)).toEqual(
      ['accordion-header'],
    );
    expect(headerClasses(swissCard.querySelector('.accordion-header')!)).toEqual(['accordion-header']);
  });

  it('swiss control card collapses the whole card via its header toggle', async () => {
    render(
      <MetadataTeamPoolRow
        {...createRowProps()}
        swissPanel={<SwissStandingsPanel gamedayId={1} />}
      />,
    );

    const swissCard = await screen.findByTestId('swiss-standings-panel');
    const swissToggle = swissCard.querySelector('.accordion-button') as HTMLElement | null;
    expect(swissToggle).toBeInTheDocument();

    fireEvent.click(swissToggle as HTMLElement);
    expect(swissToggle).toHaveClass('collapsed');
    await waitFor(() => {
      expect(swissCard.querySelector('.accordion-body')).toBeNull();
    });
  });

  it('non-Swiss row renders the shared two-card pattern with no Card frames', () => {
    const { container } = render(<MetadataTeamPoolRow {...createRowProps()} />);

    expect(screen.getByTestId('gameday-metadata-accordion')).toBeInTheDocument();
    expect(screen.getByTestId('team-pool-card')).toBeInTheDocument();
    expect(screen.queryByTestId('swiss-top-row-card')).not.toBeInTheDocument();
    const row = container.querySelector('.metadata-team-pool-row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.card')).toBeNull();
    expect(row?.querySelectorAll('.accordion-item')).toHaveLength(2);
  });
});
