import { describe, expect, it } from 'vitest';

import { parseWidgetConfig } from '@/lib/params';

const parse = (search: string) => parseWidgetConfig(new URLSearchParams(search));

describe('parseWidgetConfig', () => {
  it('defaults to spielplan with no teams', () => {
    const cfg = parse('');
    expect(cfg.view).toBe('spielplan');
    expect(cfg.teams).toEqual([]);
    expect(cfg.color).toBe('ff4500');
    expect(cfg.past).toBe(3);
    expect(cfg.future).toBe(0);
    expect(cfg.showPast).toBe(true);
    expect(cfg.showFuture).toBe(true);
    expect(cfg.title).toBe(true);
    expect(cfg.compact).toBe(false);
    expect(cfg.poweredBy).toBe(true);
    expect(cfg.liveUrl).toBeNull();
    expect(cfg.logo).toBeNull();
    expect(cfg.refresh).toBe(false);
  });

  it('collects repeated team ids as numbers', () => {
    expect(parse('t=159&t=287').teams).toEqual([159, 287]);
  });

  it('ignores non-numeric and non-positive team ids', () => {
    expect(parse('t=abc&t=0&t=-5&t=12').teams).toEqual([12]);
  });

  it('accepts known views and falls back for unknown ones', () => {
    expect(parse('view=live').view).toBe('live');
    expect(parse('view=table').view).toBe('table');
    expect(parse('view=bogus').view).toBe('spielplan');
  });

  it('sanitises the accent color', () => {
    expect(parse('color=1a73e8').color).toBe('1a73e8');
    expect(parse('color=nothex').color).toBe('ff4500');
    expect(parse('color=%23ff0000').color).toBe('ff4500');
  });

  it('parses numeric display options', () => {
    const cfg = parse('past=5&future=2');
    expect(cfg.past).toBe(5);
    expect(cfg.future).toBe(2);
  });

  it('falls back on invalid numeric options', () => {
    const cfg = parse('past=x&future=-1');
    expect(cfg.past).toBe(3);
    expect(cfg.future).toBe(0);
  });

  it('treats 0 toggles as false and defaults to true', () => {
    const cfg = parse('show_past=0&show_future=0&title=0&powered=0&compact=1');
    expect(cfg.showPast).toBe(false);
    expect(cfg.showFuture).toBe(false);
    expect(cfg.title).toBe(false);
    expect(cfg.poweredBy).toBe(false);
    expect(cfg.compact).toBe(true);
  });

  it('only accepts http(s) urls for live_url and logo', () => {
    expect(parse('live_url=https%3A%2F%2Fx.de%2Flive').liveUrl).toBe(
      'https://x.de/live'
    );
    expect(parse('live_url=javascript%3Aalert(1)').liveUrl).toBeNull();
    expect(parse('logo=https%3A%2F%2Fx.de%2Fl.png').logo).toBe('https://x.de/l.png');
    expect(parse('logo=//evil.example/x.png').logo).toBeNull();
  });

  it('detects the refresh flag', () => {
    expect(parse('refresh').refresh).toBe(true);
    expect(parse('refresh=1').refresh).toBe(true);
    expect(parse('refresh=0').refresh).toBe(false);
  });
});
