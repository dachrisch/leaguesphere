import { useEffect } from 'react';

import { measureContentHeight, notifyParentHeight } from '../lib/embed';

export function useAutoHeight(): void {
  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    const send = () => {
      // Ignore a zero measurement (content not mounted yet); a later
      // ResizeObserver callback will report the real height.
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
