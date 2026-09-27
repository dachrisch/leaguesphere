import { describe, expect, it, vi } from 'vitest';

import { WIDGET_MESSAGE_TYPE, notifyParentHeight } from '../lib/embed';

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
