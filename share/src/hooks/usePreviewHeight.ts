import { useEffect, useRef, useState } from 'react';

import { nextFrameHeight, WIDGET_MESSAGE_TYPE } from '../lib/embed';

/**
 * Live preview auto-height for the generator's own iframe.
 *
 * Mirrors the documented listener snippet: listens for the widget's
 * `iframeHeight` message from our own origin and grows (never shrinks) the
 * preview so the whole widget is visible while configuring it.
 */
export function usePreviewHeight(active: boolean) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(420);

  useEffect(() => {
    if (!active) {
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as { type?: string; height?: number } | null;
      const measured = data?.height;
      if (data?.type !== WIDGET_MESSAGE_TYPE || typeof measured !== 'number') {
        return;
      }
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }
      setHeight((previous) => nextFrameHeight(previous, measured));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  return [frameRef, height] as const;
}
