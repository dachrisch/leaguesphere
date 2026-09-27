import { useEffect } from 'react';

import { notifyParentHeight } from '../lib/embed';

export function useAutoHeight(): void {
  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    const send = () =>
      notifyParentHeight(
        document.documentElement.scrollHeight,
        window.parent,
        false
      );
    send();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(send);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
}
