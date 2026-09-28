import { describe, expect, it, vi } from 'vitest';

import {
  isWidgetLoading,
  measureContentHeight,
  notifyParentHeight,
  WIDGET_MESSAGE_TYPE,
} from '../lib/embed';

describe('notifyParentHeight', () => {
  it('posts a tagged height message to the parent frame', () => {
    const postMessage = vi.fn();
    const parent = { postMessage } as unknown as Window;
    notifyParentHeight(420, parent, false);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: WIDGET_MESSAGE_TYPE, height: 420 },
      '*'
    );
  });

  it('does nothing when there is no parent window', () => {
    const postMessage = vi.fn();
    notifyParentHeight(420, { postMessage } as unknown as Window, true);
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('measureContentHeight', () => {
  it('measures the widget content, not the viewport height', () => {
    document.body.innerHTML = '<div id="share-widget-root"></div>';
    const root = document.getElementById('share-widget-root') as HTMLElement;
    // Simulate a short viewport with taller content.
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(root, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 812, top: 0 }),
    });

    expect(measureContentHeight(document)).toBeGreaterThanOrEqual(812);
  });

  it('falls back to the body height when the root is missing', () => {
    document.body.innerHTML = '';
    Object.defineProperty(document.body, 'scrollHeight', {
      configurable: true,
      value: 250,
    });
    expect(measureContentHeight(document)).toBe(250);
  });
});

describe('isWidgetLoading', () => {
  it('is true while the loading placeholder is shown', () => {
    document.body.innerHTML = '<div id="share-widget-root"><p class="share-loading">Lädt…</p></div>';
    expect(isWidgetLoading(document)).toBe(true);
  });

  it('is false once real content is rendered', () => {
    document.body.innerHTML = '<div id="share-widget-root"><table></table></div>';
    expect(isWidgetLoading(document)).toBe(false);
  });
});
