import { useEffect } from 'react';

import {
  isWidgetLoading,
  measureContentHeight,
  notifyParentHeight,
} from '../lib/embed';

export function useAutoHeight(): void {
  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    const send = () => {
      // Skip the transient loading/empty shell: reporting its tiny height
      // makes the embed shrink before the real content arrives.
      if (isWidgetLoading(document)) {
        return;
      }
      const height = measureContentHeight(document);
      if (height > 0) {
        notifyParentHeight(height, window.parent, false);
      }
    };
    const frame = window.requestAnimationFrame(send);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    const root = document.getElementById('share-widget-root');
    if (root !== null) {
      observer.observe(root);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
}
