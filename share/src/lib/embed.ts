export const WIDGET_MESSAGE_TYPE = 'iframeHeight';

/**
 * Ask the embedding page to resize our iframe.
 *
 * The parent listener script (documented on the generator page) checks
 * `event.origin === 'https://leaguesphere.app'` before trusting the height.
 * When the widget is opened top-level there is no parent to notify.
 */
export function notifyParentHeight(
  height: number,
  target: Window = window.parent,
  isTopLevel: boolean = window.parent === window
): void {
  if (isTopLevel) {
    return;
  }
  target.postMessage({ type: WIDGET_MESSAGE_TYPE, height }, '*');
}
