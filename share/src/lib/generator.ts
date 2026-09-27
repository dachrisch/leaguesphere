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
  poweredBy: boolean;
  liveUrl: string | null;
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
  if (!options.poweredBy) {
    params.set('powered', '0');
  }
  if (options.liveUrl) {
    params.set('live_url', options.liveUrl);
  }

  return `${base}?${params.toString()}`;
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

export const PARENT_LISTENER_SNIPPET = `<script>
window.addEventListener('message', function (event) {
  if (event.origin !== 'https://leaguesphere.app') return;
  if (!event.data || event.data.type !== 'iframeHeight') return;
  var frames = document.getElementsByTagName('iframe');
  for (var i = 0; i < frames.length; i++) {
    try {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = event.data.height + 'px';
        break;
      }
    } catch (error) {}
  }
});
</script>`;
