import { describe, expect, it } from 'vitest';

import {
  buildIframeSnippet,
  buildListenerSnippet,
  buildWidgetUrl,
  type GeneratorOptions,
} from '../lib/generator';

const base = 'https://leaguesphere.app/share/widget/';

const defaults: GeneratorOptions = {
  teams: [159],
  view: 'spielplan',
  color: 'ff4500',
  past: 3,
  future: 0,
  showPast: true,
  showFuture: true,
  title: true,
  compact: false,
  liveUrl: null,
  logo: null,
  season: null,
  seasonName: null,
  league: null,
};

describe('buildWidgetUrl', () => {
  it('always includes the team ids', () => {
    expect(buildWidgetUrl(base, { ...defaults, teams: [159, 287] })).toBe(
      `${base}?t=159&t=287`
    );
  });

  it('omits parameters that are at their default', () => {
    expect(buildWidgetUrl(base, defaults)).toBe(`${base}?t=159`);
  });

  it('includes only the options that differ from the defaults', () => {
    const url = buildWidgetUrl(base, {
      ...defaults,
      view: 'table',
      color: '1a73e8',
      past: 5,
      showPast: false,
      compact: true,
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('view')).toBe('table');
    expect(params.get('color')).toBe('1a73e8');
    expect(params.get('past')).toBe('5');
    expect(params.get('show_past')).toBe('0');
    expect(params.get('compact')).toBe('1');
    expect(params.has('future')).toBe(false);
  });

  it('includes a validated live url', () => {
    const url = buildWidgetUrl(base, {
      ...defaults,
      liveUrl: 'https://renegades.de/live',
    });
    expect(new URLSearchParams(url.split('?')[1]).get('live_url')).toBe(
      'https://renegades.de/live'
    );
  });

  it('includes the club-provided logo url', () => {
    const url = buildWidgetUrl(base, {
      ...defaults,
      logo: 'https://club.de/logo.png',
    });
    expect(new URLSearchParams(url.split('?')[1]).get('logo')).toBe(
      'https://club.de/logo.png'
    );
  });

  it('never emits a powered param, even for legacy configs', () => {
    const legacy = { ...defaults, poweredBy: false } as unknown as GeneratorOptions;
    const params = new URLSearchParams(buildWidgetUrl(base, legacy).split('?')[1]);
    expect(params.has('powered')).toBe(false);
  });

  it('includes season and league when chosen', () => {
    const url = buildWidgetUrl(base, { ...defaults, season: 5, league: 8 });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('season')).toBe('5');
    expect(params.get('league')).toBe('8');
  });

  it('emits a human-readable year when the season name has one', () => {
    const url = buildWidgetUrl(base, {
      ...defaults,
      season: 6,
      seasonName: '2025/2026',
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('year')).toBe('2025');
    expect(params.has('season')).toBe(false);
  });

  it('falls back to the season id when the name has no year', () => {
    const url = buildWidgetUrl(base, { ...defaults, season: 5, seasonName: 'Saison' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('season')).toBe('5');
    expect(params.has('year')).toBe(false);
  });

  it('omits season and league when unset', () => {
    const params = new URLSearchParams(
      buildWidgetUrl(base, defaults).split('?')[1]
    );
    expect(params.has('season')).toBe(false);
    expect(params.has('league')).toBe(false);
  });
});

describe('snippets', () => {
  it('wraps the url in an iframe snippet', () => {
    const snippet = buildIframeSnippet(`${base}?t=159`);
    expect(snippet).toContain(`src="${base}?t=159"`);
    expect(snippet).toContain('<iframe');
  });

  it('ships a parent listener bound to the widget origin', () => {
    const snippet = buildListenerSnippet('https://stage.leaguesphere.app');
    expect(snippet).toContain('iframeHeight');
    expect(snippet).toContain('https://stage.leaguesphere.app');
  });

  it('makes the listener grow-only so a transient small height cannot collapse the embed', () => {
    // The listener keeps the largest height seen per iframe.
    const snippet = buildListenerSnippet('https://leaguesphere.app');
    expect(snippet).toContain('_lsHeight');
    expect(snippet).toMatch(/Math\.max/);
  });
});
