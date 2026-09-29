const VIEWS = ['spielplan', 'table', 'live'] as const;

export type ViewName = (typeof VIEWS)[number];

const DEFAULT_COLOR = 'ff4500';
const DEFAULT_PAST = 3;
const DEFAULT_FUTURE = 0;

export interface WidgetConfig {
  teams: number[];
  view: ViewName;
  color: string;
  past: number;
  future: number;
  showPast: boolean;
  showFuture: boolean;
  title: boolean;
  compact: boolean;
  logo: string | null;
  liveUrl: string | null;
  season: number | null;
  league: number | null;
  year: string | null;
}

function parseTeamIds(params: URLSearchParams): number[] {
  return params
    .getAll('t')
    .map((raw) => Number.parseInt(raw, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function parseColor(raw: string | null): string {
  return raw !== null && /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)
    ? raw
    : DEFAULT_COLOR;
}

function parseCount(raw: string | null, fallback: number): number {
  if (raw === null || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === null) {
    return fallback;
  }
  return !(raw === '0' || raw.toLowerCase() === 'false');
}

function parseHttpUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || raw === '') {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function parseWidgetConfig(params: URLSearchParams): WidgetConfig {
  const view = params.get('view');
  return {
    teams: parseTeamIds(params),
    view: (VIEWS as readonly string[]).includes(view ?? '')
      ? (view as ViewName)
      : 'spielplan',
    color: parseColor(params.get('color')),
    past: parseCount(params.get('past'), DEFAULT_PAST),
    future: parseCount(params.get('future'), DEFAULT_FUTURE),
    showPast: parseBool(params.get('show_past'), true),
    showFuture: parseBool(params.get('show_future'), true),
    title: parseBool(params.get('title'), true),
    compact: parseBool(params.get('compact'), false),
    logo: parseHttpUrl(params.get('logo')),
    liveUrl: parseHttpUrl(params.get('live_url')),
    season: parsePositiveInt(params.get('season')),
    league: parsePositiveInt(params.get('league')),
    year: parseYear(params.get('year')),
  };
}

function parseYear(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}
