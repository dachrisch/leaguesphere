import type { CSSProperties, ReactNode } from 'react';

import type { WidgetConfig } from '../lib/params';
import { PoweredBy } from './PoweredBy';

/**
 * Shared widget chrome: the root element, the club-provided logo header, the
 * public CSS customization hooks and the (non-optional) attribution footer.
 *
 * Customization: the root carries a stable `share-widget--<view>` class and
 * exposes `--share-accent` inline (from the `color` option). Embedders can
 * override any `--share-*` custom property or `share-*` class from their own
 * stylesheet; the generator sets the common ones for non-developers.
 */
export function WidgetShell({
  config,
  children,
}: {
  config: WidgetConfig;
  children: ReactNode;
}) {
  const className = [
    'share-widget',
    `share-widget--${config.view}`,
    config.compact ? 'text-body' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={{ '--share-accent': `#${config.color}` } as CSSProperties}
    >
      {config.logo !== null && (
        <header className="share-header">
          <img className="share-logo" src={config.logo} alt="" />
        </header>
      )}
      {children}
      <PoweredBy />
    </div>
  );
}
