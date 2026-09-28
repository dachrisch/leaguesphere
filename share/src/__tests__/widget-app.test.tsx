import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../widget/App';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubApi(seasons: Array<{ id: number; name: string }>) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith('/api/seasons/')
      ? seasons
      : { gamedays: [], generated_at: 'x', etag: 'e' };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('widget App season resolution', () => {
  it('resolves ?year= to the season id in the snapshot request', async () => {
    const fetcher = stubApi([{ id: 6, name: '2026' }]);
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026');
    render(<App />);
    await waitFor(() =>
      expect(
        fetcher.mock.calls.map((call) => String(call[0])).some((url) =>
          url.includes('/api/snapshot/') && url.includes('season=6')
        )
      ).toBe(true)
    );
  });

  it('prefers an explicit ?season= over ?year=', async () => {
    const fetcher = stubApi([{ id: 6, name: '2026' }]);
    window.history.pushState({}, '', '/share/widget/?t=159&year=2026&season=3');
    render(<App />);
    await waitFor(() =>
      expect(
        fetcher.mock.calls.map((call) => String(call[0])).some((url) =>
          url.includes('/api/snapshot/') && url.includes('season=3')
        )
      ).toBe(true)
    );
  });
});
