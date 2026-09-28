export const WIDGET_MESSAGE_TYPE = 'iframeHeight';

export const WIDGET_ROOT_ID = 'share-widget-root';

/**
 * Content height of the widget document.
 *
 * Deliberately NOT `documentElement.scrollHeight`: inside an iframe that value
 * is clamped to the iframe's own viewport height, so reporting it just echoes
 * back the current frame size (the widget could never grow). Measure the
 * widget root element instead, falling back to the body.
 */
export function measureContentHeight(doc: Document = document): number {
  const root = doc.getElementById(WIDGET_ROOT_ID);
  if (root !== null) {
    const rect = root.getBoundingClientRect();
    const style = doc.defaultView?.getComputedStyle(root);
    const margin =
      (style ? parseFloat(style.marginTop) + parseFloat(style.marginBottom) : 0) ||
      0;
    return Math.ceil(rect.height + margin);
  }
  return doc.body?.scrollHeight ?? 0;
}

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
