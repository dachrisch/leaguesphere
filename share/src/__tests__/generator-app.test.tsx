import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../generator/App';

afterEach(() => {
  vi.restoreAllMocks();
});

interface StubData {
  teams?: Array<Record<string, unknown>>;
  seasons?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown>;
}

function stubApi(data: StubData) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {};
      if (url.startsWith('/api/teams/')) {
        body = { results: data.teams ?? [] };
      } else if (url.startsWith('/api/seasons/')) {
        body = data.seasons ?? [];
      } else if (url.startsWith('/api/snapshot/')) {
        body = data.snapshot ?? { gamedays: [] };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

async function pickTeam(name: RegExp) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ren' } });
  fireEvent.click(await screen.findByRole('button', { name }));
}

describe('generator App options', () => {
  it('does not list teams until the user searches', async () => {
    stubApi({ teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }] });
    const { container } = render(<App />);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(container.querySelectorAll('.share-gen__results button')).toHaveLength(0);
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'placeholder',
      'Team suchen…'
    );

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Ren' },
    });
    expect(
      await screen.findByRole('button', { name: /Renegades \(Ren\)/ })
    ).toBeInTheDocument();
  });

  it('offers color and logo customization and no attribution toggle', () => {
    stubApi({});
    const { container } = render(<App />);

    expect(screen.getByTestId('gen-color')).toBeInTheDocument();
    expect(screen.getByTestId('gen-logo')).toBeInTheDocument();
    expect(container.querySelector('#opt-powered')).toBeNull();
  });

  it('builds an embed url with the chosen color and logo, and no powered param', async () => {
    stubApi({ teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }] });
    render(<App />);

    await pickTeam(/Renegades \(Ren\)/);

    fireEvent.change(screen.getByTestId('gen-color'), {
      target: { value: '#1a73e8' },
    });
    fireEvent.change(screen.getByTestId('gen-logo'), {
      target: { value: 'https://club.de/logo.png' },
    });

    await waitFor(() => {
      const iframe = screen.getByTitle('Vorschau');
      const params = new URLSearchParams(
        (iframe.getAttribute('src') ?? '').split('?')[1]
      );
      expect(params.get('color')).toBe('1a73e8');
      expect(params.get('logo')).toBe('https://club.de/logo.png');
      expect(params.has('powered')).toBe(false);
    });
  });

  it('offers the season and the leagues the team played in that season', async () => {
    stubApi({
      teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }],
      seasons: [
        { id: 6, name: '2026' },
        { id: 5, name: '2025' },
      ],
      snapshot: {
        gamedays: [
          { league: 57, league_display: 'Bayernpokal' },
          { league: 8, league_display: 'DFFL2' },
        ],
      },
    });
    render(<App />);

    await pickTeam(/Renegades \(Ren\)/);

    fireEvent.change(screen.getByTestId('gen-season'), {
      target: { value: '5' },
    });

    const lemmaOption = await screen.findByRole('option', { name: 'DFFL2' });
    expect(lemmaOption).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bayernpokal' })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('gen-league'), {
      target: { value: '8' },
    });

    await waitFor(() => {
      const iframe = screen.getByTitle('Vorschau');
      const params = new URLSearchParams(
        (iframe.getAttribute('src') ?? '').split('?')[1]
      );
      // Season name "2025" carries a year, so it is emitted as ?year=.
      expect(params.get('year')).toBe('2025');
      expect(params.get('league')).toBe('8');
    });
  });

  it('derives leagues before a season is chosen and hints to pick one for the table', async () => {
    stubApi({
      teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }],
      snapshot: {
        gamedays: [
          { league: 57, league_display: 'Bayernpokal' },
          { league: 8, league_display: 'DFFL2' },
        ],
      },
    });
    render(<App />);

    await pickTeam(/Renegades \(Ren\)/);

    // Leagues come from the all-season snapshot, even before a season is set.
    expect(
      await screen.findByRole('option', { name: 'DFFL2' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('gen-view'), {
      target: { value: 'table' },
    });
    expect(
      await screen.findByText(/Mehrere Ligen gefunden/)
    ).toBeInTheDocument();
  });

  it('offers a live url input for the live view and round-trips it', async () => {
    stubApi({
      teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }],
    });
    render(<App />);
    await pickTeam(/Renegades \(Ren\)/);

    // Not shown for the default (plan) view.
    expect(screen.queryByTestId('gen-live-url')).toBeNull();

    fireEvent.change(screen.getByTestId('gen-view'), {
      target: { value: 'live' },
    });
    fireEvent.change(screen.getByTestId('gen-live-url'), {
      target: { value: 'https://club.de/live' },
    });

    await waitFor(() => {
      const iframe = screen.getByTitle('Vorschau');
      const params = new URLSearchParams(
        (iframe.getAttribute('src') ?? '').split('?')[1]
      );
      expect(params.get('view')).toBe('live');
      expect(params.get('live_url')).toBe('https://club.de/live');
    });
  });

  it('derives leagues across all selected teams, not just the first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/teams/')) {
          return new Response(
            JSON.stringify({
              results: [
                { id: 159, name: 'Renegades', description: 'Ren', logo: null },
                { id: 200, name: 'Crocodiles', description: 'Cro', logo: null },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.startsWith('/api/seasons/')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.startsWith('/api/snapshot/')) {
          const teams = new URL(url, 'http://localhost').searchParams.getAll('team');
          const gamedays = teams.includes('200')
            ? [
                { league: 7, league_display: 'DFFL' },
                { league: 12, league_display: 'RL BAWÜ' },
              ]
            : [{ league: 7, league_display: 'DFFL' }];
          return new Response(JSON.stringify({ gamedays }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    render(<App />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ren' } });
    fireEvent.click(
      await screen.findByRole('button', { name: /Renegades \(Ren\)/ })
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Cro' } });
    fireEvent.click(
      await screen.findByRole('button', { name: /Crocodiles \(Cro\)/ })
    );

    expect(await screen.findByRole('option', { name: 'DFFL' })).toBeInTheDocument();
    expect(
      await screen.findByRole('option', { name: 'RL BAWÜ' })
    ).toBeInTheDocument();
  });

  it('debounces the preview url so a burst of changes reloads the iframe once', async () => {
    stubApi({
      teams: [{ id: 159, name: 'Renegades', description: 'Ren', logo: null }],
    });
    render(<App />);
    await pickTeam(/Renegades \(Ren\)/);

    const initialSrc =
      (await screen.findByTitle('Vorschau')).getAttribute('src') ?? '';
    vi.useFakeTimers();
    try {
      const color = screen.getByTestId('gen-color');
      fireEvent.change(color, { target: { value: '#111111' } });
      fireEvent.change(color, { target: { value: '#222222' } });
      fireEvent.change(color, { target: { value: '#333333' } });
      // Not reloaded yet — the preview url is debounced.
      expect(screen.getByTitle('Vorschau').getAttribute('src')).toBe(initialSrc);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      const src = screen.getByTitle('Vorschau').getAttribute('src') ?? '';
      expect(new URLSearchParams(src.split('?')[1]).get('color')).toBe('333333');
    } finally {
      vi.useRealTimers();
    }
  });
});
