import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    const iframe = await screen.findByTitle('Vorschau');
    const params = new URLSearchParams(
      (iframe.getAttribute('src') ?? '').split('?')[1]
    );
    expect(params.get('color')).toBe('1a73e8');
    expect(params.get('logo')).toBe('https://club.de/logo.png');
    expect(params.has('powered')).toBe(false);
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
});
