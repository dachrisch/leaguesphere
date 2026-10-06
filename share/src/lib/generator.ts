import { snapshotUrl } from './api';
import type { ViewName } from './params';

export interface GeneratorOptions {
  teams: number[];
  view: ViewName;
  color: string;
  past: number;
  future: number;
  showPast: boolean;
  showFuture: boolean;
  title: boolean;
  compact: boolean;
  liveUrl: string | null;
  logo: string | null;
  season: number | null;
  seasonName: string | null;
  league: number | null;
}

const DEFAULT_COLOR = 'ff4500';
const DEFAULT_PAST = 3;
const DEFAULT_FUTURE = 0;

export function buildWidgetUrl(base: string, options: GeneratorOptions): string {
  const params = new URLSearchParams();
  options.teams.forEach((id) => params.append('t', String(id)));

  if (options.view !== 'spielplan') {
    params.set('view', options.view);
  }
  if (options.color !== DEFAULT_COLOR) {
    params.set('color', options.color);
  }
  if (options.past !== DEFAULT_PAST) {
    params.set('past', String(options.past));
  }
  if (options.future !== DEFAULT_FUTURE) {
    params.set('future', String(options.future));
  }
  if (!options.showPast) {
    params.set('show_past', '0');
  }
  if (!options.showFuture) {
    params.set('show_future', '0');
  }
  if (!options.title) {
    params.set('title', '0');
  }
  if (options.compact) {
    params.set('compact', '1');
  }
  if (options.logo) {
    params.set('logo', options.logo);
  }
  if (options.liveUrl) {
    params.set('live_url', options.liveUrl);
  }
  if (options.season !== null) {
    // Prefer a human-readable year when the season name starts with one
    // (e.g. "2026" or "2025/2026"), so the URL is easy to read and edit.
    const year = options.seasonName?.match(/^(\d{4})/)?.[1];
    if (year !== undefined) {
      params.set('year', year);
    } else {
      params.set('season', String(options.season));
    }
  }
  if (options.league !== null) {
    params.set('league', String(options.league));
  }

  return `${base}?${params.toString()}`;
}

/**
 * The public API URL for the current selection: the same data the widget
 * shows, as JSON, for clubs that build their own display.
 * Prefers `year=` like the widget URL when the season name starts with a
 * year, so both copy-fields select the same seasons.
 */
export function buildSnapshotDataUrl(
  origin: string,
  options: Pick<GeneratorOptions, 'teams' | 'season' | 'league'> & {
    seasonName?: string | null;
  }
): string {
  const year = options.seasonName?.match(/^(\d{4})/)?.[1];
  return `${origin}${snapshotUrl(options.teams, {
    include: ['games', 'teams', 'standings'],
    ...(year !== undefined
      ? { year }
      : { season: options.season ?? undefined }),
    league: options.league ?? undefined,
  })}`;
}

export function buildIframeSnippet(url: string): string {
  return `<iframe
  src="${url}"
  width="100%"
  height="400"
  frameborder="0"
  style="border:none;overflow:hidden"
  title="LeagueSphere"
></iframe>`;
}

export function buildListenerSnippet(origin: string): string {
  return `<script>
window.addEventListener('message', function (event) {
  if (event.origin !== ${JSON.stringify(origin)}) return;
  if (!event.data || event.data.type !== 'iframeHeight') return;
  var frames = document.getElementsByTagName('iframe');
  for (var i = 0; i < frames.length; i++) {
    try {
      if (frames[i].contentWindow === event.source) {
        // Grow-only: a short measurement while the widget is still loading
        // must not collapse the frame and hide the content.
        var prev = frames[i]._lsHeight || 0;
        var next = Math.max(prev, event.data.height);
        frames[i]._lsHeight = next;
        frames[i].style.height = next + 'px';
        break;
      }
    } catch (error) {}
  }
});
</script>`;
}
